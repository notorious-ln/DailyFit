import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DayTask,
  JournalEvent,
  Prisma,
  RecommendationStatus,
} from '@prisma/client';
import { JournalService } from '../journal/journal.service';
import {
  extractMeals,
  minCaloriesFloor,
} from '../assistant/rules-meal-recs';
import {
  ExerciseShape,
  RecommendationItem,
  extractExercises,
  workoutVolumeSets,
} from '../assistant/rules-workout-recs';
import { asObject } from '../catalog/catalog.service';
import {
  addUtcDays,
  calendarToday,
  parseDateParam,
  startOfIsoWeek,
} from '../day/date.util';
import { calculateMaintenanceCalories } from '../plans/calorie-calculator';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DecideRecommendationDto } from './dto/decide-recommendation.dto';
import {
  RecommendationResponse,
  assertCalorieWithinLimit,
  assertVolumeWithinLimit,
  parseRecommendationItems,
  selectItemsForAccept,
  toRecommendationResponse,
} from './recommendation.mapper';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly journal: JournalService,
  ) {}

  async decide(
    userId: number,
    id: number,
    dto: DecideRecommendationDto,
  ): Promise<RecommendationResponse> {
    const recommendation = await this.prisma.recommendation.findFirst({
      where: { id, userId },
    });
    if (!recommendation) {
      throw new NotFoundException({ message: 'Рекомендация не найдена' });
    }
    if (recommendation.status !== RecommendationStatus.draft) {
      throw new ConflictException({
        message: 'Рекомендация уже обработана',
      });
    }

    if (dto.action === 'reject') {
      const updated = await this.prisma.$transaction(async (tx) => {
        const rejected = await tx.recommendation.update({
          where: { id },
          data: { status: RecommendationStatus.rejected },
        });
        await this.journal.record(
          {
            userId,
            event: JournalEvent.recommendation_rejected,
            details: {
              recommendation_id: id,
              status: RecommendationStatus.rejected,
            },
          },
          tx,
        );
        this.logger.log(`отклонение рекомендации user=${userId} id=${id}`);
        return rejected;
      });
      return toRecommendationResponse(updated);
    }

    const items = parseRecommendationItems(recommendation.itemsJson);
    const selected = selectItemsForAccept(items, dto.selectedItems);
    if (selected.length === 0) {
      throw new BadRequestException({
        message: 'Нет пунктов для принятия',
      });
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const today = calendarToday();
        const weekStart = startOfIsoWeek(today);
        const weekEnd = addUtcDays(weekStart, 6);
        const weekWorkouts = await tx.dayTask.findMany({
          where: {
            kind: 'workout',
            taskDate: { gte: weekStart, lte: weekEnd },
            plan: { userId, isActive: true },
          },
        });
        const baseVolume = workoutVolumeSets(
          weekWorkouts.map((task) => ({
            id: task.id,
            planId: task.planId,
            title: task.title,
            taskDate: task.taskDate,
            status: task.status,
            detailsJson: task.detailsJson,
          })),
        );
        assertVolumeWithinLimit(selected, baseVolume);

        const mealPlan = await tx.activePlan.findFirst({
          where: { userId, isActive: true, type: 'meal' },
        });
        const currentCalories = mealPlan?.dailyCalories ?? null;
        if (
          selected.some((item) => item.change.kind === 'shift_calories') &&
          currentCalories != null
        ) {
          assertCalorieWithinLimit(selected, currentCalories);
          const user = await this.usersService.findById(userId);
          const maintenance = user
            ? calculateMaintenanceCalories(user)
            : null;
          const floor = minCaloriesFloor(maintenance);
          for (const item of selected) {
            if (item.change.kind !== 'shift_calories') {
              continue;
            }
            if (
              floor != null &&
              item.change.toCalories != null &&
              item.change.toCalories < floor
            ) {
              throw new Error(
                `CALORIE_FLOOR:${item.change.toCalories}/${floor}`,
              );
            }
          }
        }

        for (const item of selected) {
          await this.applyItem(tx, userId, today, item);
        }

        const status =
          selected.length === items.length
            ? RecommendationStatus.accepted
            : RecommendationStatus.partially_accepted;

        const saved = await tx.recommendation.update({
          where: { id },
          data: {
            status,
            itemsJson: items.map((item) => ({
              ...item,
              selected: selected.some((picked) => picked.id === item.id),
            })) as Prisma.InputJsonValue,
          },
        });
        await this.journal.record(
          {
            userId,
            event: JournalEvent.recommendation_accepted,
            details: {
              recommendation_id: id,
              status,
              selected_count: selected.length,
            },
          },
          tx,
        );
        this.logger.log(
          `принятие рекомендации user=${userId} id=${id} status=${saved.status} items=${selected.length}`,
        );
        return saved;
      });

      return toRecommendationResponse(updated);
    } catch (error) {
      this.logger.warn(
        `ошибка принятия рекомендации user=${userId} id=${id}: ${String(error)}`,
      );
      throw new ConflictException({
        message: 'Не удалось применить рекомендацию, статус не изменён',
      });
    }
  }

  private async applyItem(
    tx: Prisma.TransactionClient,
    userId: number,
    today: Date,
    item: RecommendationItem,
  ): Promise<void> {
    if (
      item.change.kind === 'replace_dish' ||
      item.change.kind === 'shift_calories'
    ) {
      await this.applyMealItem(tx, userId, today, item);
      return;
    }

    const task = await tx.dayTask.findFirst({
      where: {
        id: item.change.taskId,
        kind: 'workout',
        plan: { userId, isActive: true },
      },
    });
    if (!task) {
      throw new Error(`TASK_MISSING:${item.change.taskId}`);
    }
    if (
      task.taskDate.getTime() < today.getTime() ||
      task.status != null
    ) {
      throw new Error(`TASK_NOT_EDITABLE:${task.id}`);
    }

    if (item.change.kind === 'reschedule') {
      await this.applyReschedule(tx, task, item);
      return;
    }

    await this.applyExerciseChange(tx, task, item);
  }

  private async applyMealItem(
    tx: Prisma.TransactionClient,
    userId: number,
    today: Date,
    item: RecommendationItem,
  ): Promise<void> {
    const planId = item.change.planId;
    if (planId == null) {
      throw new Error('MEAL_PLAN_MISSING');
    }

    const plan = await tx.activePlan.findFirst({
      where: { id: planId, userId, isActive: true, type: 'meal' },
    });
    if (!plan) {
      throw new Error(`MEAL_PLAN_NOT_FOUND:${planId}`);
    }

    const futureTasks = await tx.dayTask.findMany({
      where: {
        planId: plan.id,
        kind: 'meal',
        taskDate: { gte: today },
        status: null,
      },
    });
    if (futureTasks.length === 0) {
      throw new Error('MEAL_NO_EDITABLE_TASKS');
    }

    if (item.change.kind === 'shift_calories') {
      await this.applyCalorieShift(tx, plan, futureTasks, item);
      return;
    }

    await this.applyDishReplace(tx, plan, futureTasks, item);
  }

  private async applyCalorieShift(
    tx: Prisma.TransactionClient,
    plan: { id: number; dailyCalories: number | null },
    futureTasks: DayTask[],
    item: RecommendationItem,
  ): Promise<void> {
    const toCalories = item.change.toCalories;
    if (toCalories == null || toCalories < 1) {
      throw new Error('CALORIES_INVALID');
    }
    if (
      item.change.fromCalories != null &&
      plan.dailyCalories != null &&
      plan.dailyCalories !== item.change.fromCalories
    ) {
      throw new Error('CALORIES_MISMATCH');
    }

    await tx.activePlan.update({
      where: { id: plan.id },
      data: { dailyCalories: toCalories },
    });

    for (const task of futureTasks) {
      const details = asObject(task.detailsJson ?? {});
      await tx.dayTask.update({
        where: { id: task.id },
        data: {
          detailsJson: {
            ...details,
            daily_calories: toCalories,
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async applyDishReplace(
    tx: Prisma.TransactionClient,
    plan: { id: number; bodyJson: Prisma.JsonValue },
    futureTasks: DayTask[],
    item: RecommendationItem,
  ): Promise<void> {
    const mealIndex = item.change.mealIndex;
    const exampleIndex = item.change.exampleIndex;
    const fromExample = item.change.fromExample;
    const toExample = item.change.toExample;
    if (
      mealIndex == null ||
      exampleIndex == null ||
      !fromExample ||
      !toExample
    ) {
      throw new Error('DISH_REPLACE_FIELDS');
    }

    const body = asObject(plan.bodyJson);
    const planMeals = Array.isArray(body.meals)
      ? body.meals.map((slot) =>
          slot != null && typeof slot === 'object' && !Array.isArray(slot)
            ? { ...(slot as Record<string, unknown>) }
            : slot,
        )
      : [];

    this.replaceExampleInMeals(
      planMeals,
      mealIndex,
      exampleIndex,
      fromExample,
      toExample,
    );

    await tx.activePlan.update({
      where: { id: plan.id },
      data: {
        bodyJson: {
          ...body,
          meals: planMeals,
        } as Prisma.InputJsonValue,
      },
    });

    for (const task of futureTasks) {
      const details = asObject(task.detailsJson ?? {});
      const meals = extractMeals(task.detailsJson).map((slot) => ({
        ...slot,
        examples: Array.isArray(slot.examples) ? [...slot.examples] : [],
      }));
      this.replaceExampleInMeals(
        meals,
        mealIndex,
        exampleIndex,
        fromExample,
        toExample,
      );
      await tx.dayTask.update({
        where: { id: task.id },
        data: {
          detailsJson: {
            ...details,
            meals,
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private replaceExampleInMeals(
    meals: Array<Record<string, unknown> | unknown>,
    mealIndex: number,
    exampleIndex: number,
    fromExample: string,
    toExample: string,
  ): void {
    if (mealIndex < 0 || mealIndex >= meals.length) {
      throw new Error(`MEAL_INDEX:${mealIndex}`);
    }
    const slot = meals[mealIndex];
    if (slot == null || typeof slot !== 'object' || Array.isArray(slot)) {
      throw new Error('MEAL_SLOT_INVALID');
    }
    const examples = Array.isArray((slot as { examples?: unknown }).examples)
      ? [...((slot as { examples: unknown[] }).examples)]
      : [];
    if (
      exampleIndex < 0 ||
      exampleIndex >= examples.length ||
      examples[exampleIndex] !== fromExample
    ) {
      throw new Error('DISH_MISMATCH');
    }
    examples[exampleIndex] = toExample;
    (slot as { examples: unknown[] }).examples = examples;
  }

  private async applyReschedule(
    tx: Prisma.TransactionClient,
    task: DayTask,
    item: RecommendationItem,
  ): Promise<void> {
    const toDateRaw = item.change.toDate;
    if (!toDateRaw) {
      throw new Error('RESCHEDULE_MISSING_DATE');
    }
    const toDate = parseDateParam(toDateRaw);
    const clash = await tx.dayTask.findFirst({
      where: {
        planId: task.planId,
        kind: 'workout',
        taskDate: toDate,
        id: { not: task.id },
      },
    });
    if (clash) {
      throw new Error(`RESCHEDULE_CLASH:${toDateRaw}`);
    }

    await tx.dayTask.update({
      where: { id: task.id },
      data: { taskDate: toDate },
    });
  }

  private async applyExerciseChange(
    tx: Prisma.TransactionClient,
    task: DayTask,
    item: RecommendationItem,
  ): Promise<void> {
    const details = asObject(task.detailsJson ?? {});
    const exercises = extractExercises(task.detailsJson).map((exercise) => ({
      ...exercise,
    }));
    const index = item.change.exerciseIndex;
    if (index == null || index < 0 || index >= exercises.length) {
      throw new Error(`EXERCISE_INDEX:${String(index)}`);
    }

    if (item.change.kind === 'sets') {
      if (
        item.change.toSets == null ||
        item.change.toSets < 1 ||
        exercises[index].sets !== item.change.fromSets
      ) {
        throw new Error('SETS_MISMATCH');
      }
      exercises[index].sets = item.change.toSets;
    } else if (item.change.kind === 'simplify_exercise') {
      if (
        !item.change.toName ||
        exercises[index].name !== item.change.fromName
      ) {
        throw new Error('SIMPLIFY_MISMATCH');
      }
      exercises[index].name = item.change.toName;
    } else {
      throw new Error(`UNSUPPORTED:${item.change.kind}`);
    }

    const nextDetails = {
      ...details,
      exercises,
    } as Prisma.InputJsonValue;

    await tx.dayTask.update({
      where: { id: task.id },
      data: { detailsJson: nextDetails },
    });

    await this.mirrorPlanDay(tx, task, exercises);
  }

  private async mirrorPlanDay(
    tx: Prisma.TransactionClient,
    task: DayTask,
    exercises: ExerciseShape[],
  ): Promise<void> {
    const plan = await tx.activePlan.findUnique({ where: { id: task.planId } });
    if (!plan) {
      return;
    }

    const body = asObject(plan.bodyJson);
    const days = Array.isArray(body.days) ? [...body.days] : [];
    const details = asObject(task.detailsJson ?? {});
    const dayOffset =
      typeof details.day_offset === 'number' ? details.day_offset : null;

    const dayIndex = days.findIndex((day, index) => {
      if (day == null || typeof day !== 'object' || Array.isArray(day)) {
        return false;
      }
      const offset =
        typeof (day as { day_offset?: unknown }).day_offset === 'number'
          ? (day as { day_offset: number }).day_offset
          : index;
      if (dayOffset != null) {
        return offset === dayOffset;
      }
      return (
        typeof (day as { title?: unknown }).title === 'string' &&
        (day as { title: string }).title === task.title
      );
    });

    if (dayIndex < 0) {
      return;
    }

    const current = days[dayIndex] as Record<string, unknown>;
    days[dayIndex] = { ...current, exercises };
    await tx.activePlan.update({
      where: { id: plan.id },
      data: {
        bodyJson: {
          ...body,
          days,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
