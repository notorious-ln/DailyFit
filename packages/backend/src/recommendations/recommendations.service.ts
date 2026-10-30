import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DayTask, Prisma, RecommendationStatus } from '@prisma/client';
import { asObject } from '../catalog/catalog.service';
import {
  ExerciseShape,
  RecommendationItem,
  extractExercises,
  workoutVolumeSets,
} from '../assistant/rules-workout-recs';
import {
  addUtcDays,
  calendarToday,
  dateKey,
  parseDateParam,
  startOfIsoWeek,
} from '../day/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { DecideRecommendationDto } from './dto/decide-recommendation.dto';
import {
  RecommendationResponse,
  assertVolumeWithinLimit,
  parseRecommendationItems,
  selectItemsForAccept,
  toRecommendationResponse,
} from './recommendation.mapper';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      const updated = await this.prisma.recommendation.update({
        where: { id },
        data: { status: RecommendationStatus.rejected },
      });
      this.logger.log(`отклонение рекомендации user=${userId} id=${id}`);
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
            plan: { userId },
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

        for (const item of selected) {
          await this.applyItem(tx, userId, today, item);
        }

        const status =
          selected.length === items.length
            ? RecommendationStatus.accepted
            : RecommendationStatus.partially_accepted;

        return tx.recommendation.update({
          where: { id },
          data: {
            status,
            itemsJson: items.map((item) => ({
              ...item,
              selected: selected.some((picked) => picked.id === item.id),
            })) as Prisma.InputJsonValue,
          },
        });
      });

      this.logger.log(
        `принятие рекомендации user=${userId} id=${id} status=${updated.status} items=${selected.length}`,
      );
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
    const task = await tx.dayTask.findFirst({
      where: {
        id: item.change.taskId,
        kind: 'workout',
        plan: { userId },
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
