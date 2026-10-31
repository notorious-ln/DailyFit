import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ActivePlan, JournalEvent, Prisma, TemplateType } from '@prisma/client';
import { asObject } from '../catalog/catalog.service';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { calculateDailyCalories } from './calorie-calculator';
import { ActivateMealDto } from './dto/activate-meal.dto';
import { ActivateWorkoutDto } from './dto/activate-workout.dto';

export type ActivePlanResponse = {
  id: number;
  user_id: number;
  template_id: number;
  type: TemplateType;
  title: string;
  level_place: string;
  body_json: Record<string, unknown>;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
  daily_calories: number | null;
};

export type PlanReplaceWarning = {
  message: string;
  current_plan_id: number;
  requires_confirm: true;
};

export type CaloriePreview = {
  suggested_calories: number | null;
  needs_manual_input: boolean;
  message: string;
};

type WorkoutDay = {
  day_offset?: number;
  title?: string;
  exercises?: unknown;
  description?: string;
};

type MealItem = {
  name?: string;
  examples?: string[];
};

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);
  private readonly weeksAhead = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly journal: JournalService,
  ) {}

  async listActive(userId: number): Promise<ActivePlanResponse[]> {
    const plans = await this.prisma.activePlan.findMany({
      where: { userId, isActive: true },
      orderBy: [{ type: 'asc' }, { id: 'desc' }],
    });
    return plans.map((plan) => this.toActivePlan(plan));
  }

  async activateWorkout(
    userId: number,
    dto: ActivateWorkoutDto,
  ): Promise<ActivePlanResponse | PlanReplaceWarning> {
    const template = await this.prisma.template.findFirst({
      where: {
        id: dto.templateId,
        type: TemplateType.workout,
        isVisible: true,
      },
    });

    if (!template) {
      throw new NotFoundException({
        message: 'Шаблон тренировок не найден',
      });
    }

    const plan = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const current = await tx.activePlan.findFirst({
        where: {
          userId,
          type: TemplateType.workout,
          isActive: true,
        },
        orderBy: { id: 'desc' },
      });

      if (current && !dto.confirmReplace) {
        throw new ConflictException({
          message: 'Уже есть активный план тренировок. Подтвердите замену.',
          current_plan_id: current.id,
          requires_confirm: true,
        } satisfies PlanReplaceWarning);
      }

      const today = calendarToday();
      const occupiedDates = await this.retireActivePlans(
        tx,
        userId,
        TemplateType.workout,
        today,
      );

      const created = await tx.activePlan.create({
        data: {
          userId,
          templateId: template.id,
          type: TemplateType.workout,
          title: template.title,
          levelPlace: template.levelPlace,
          bodyJson: template.bodyJson as Prisma.InputJsonValue,
          isActive: true,
        },
      });

      await this.generateFutureWorkoutTasks(tx, created, today, occupiedDates);
      await this.journal.record(
        {
          userId,
          event: JournalEvent.plan_activated,
          details: {
            plan_id: created.id,
            template_id: template.id,
            plan_type: TemplateType.workout,
          },
        },
        tx,
      );

      return created;
    });

    this.logger.log(
      `активация workout-плана user=${userId} plan=${plan.id} template=${template.id}`,
    );

    return this.toActivePlan(plan);
  }

  async activateMeal(
    userId: number,
    dto: ActivateMealDto,
  ): Promise<ActivePlanResponse | CaloriePreview> {
    const template = await this.prisma.template.findFirst({
      where: {
        id: dto.templateId,
        type: TemplateType.meal,
        isVisible: true,
      },
    });

    if (!template) {
      throw new NotFoundException({
        message: 'Шаблон питания не найден',
      });
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({ message: 'Пользователь не найден' });
    }

    const suggested = calculateDailyCalories(user);

    if (!dto.confirm) {
      if (suggested == null) {
        return {
          suggested_calories: null,
          needs_manual_input: true,
          message:
            'Недостаточно данных профиля (пол, возраст, рост, вес). Укажите суточную калорийность вручную.',
        };
      }

      return {
        suggested_calories: suggested,
        needs_manual_input: false,
        message:
          'Рассчитана стартовая калорийность. При необходимости измените значение и подтвердите.',
      };
    }

    const dailyCalories = dto.daily_calories ?? suggested;
    if (dailyCalories == null) {
      throw new BadRequestException({
        message: 'Укажите daily_calories — данных профиля недостаточно для расчёта',
      });
    }

    const plan = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const today = calendarToday();
      const occupiedDates = await this.retireActivePlans(
        tx,
        userId,
        TemplateType.meal,
        today,
      );

      const created = await tx.activePlan.create({
        data: {
          userId,
          templateId: template.id,
          type: TemplateType.meal,
          title: template.title,
          levelPlace: template.levelPlace,
          bodyJson: template.bodyJson as Prisma.InputJsonValue,
          isActive: true,
          dailyCalories,
        },
      });

      await this.generateFutureMealTasks(
        tx,
        created,
        today,
        dailyCalories,
        occupiedDates,
      );
      await this.journal.record(
        {
          userId,
          event: JournalEvent.plan_activated,
          details: {
            plan_id: created.id,
            template_id: template.id,
            plan_type: TemplateType.meal,
          },
        },
        tx,
      );

      return created;
    });

    this.logger.log(
      `активация meal-плана user=${userId} plan=${plan.id} template=${template.id} kcal=${dailyCalories}`,
    );

    return this.toActivePlan(plan);
  }

  private async lockUser(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
  }

  /** Ends active plans of this type and drops unmarked tasks from today on. */
  private async retireActivePlans(
    tx: Prisma.TransactionClient,
    userId: number,
    type: TemplateType,
    today: Date,
  ): Promise<Set<string>> {
    await tx.activePlan.updateMany({
      where: { userId, type, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    });

    const kept = await tx.dayTask.findMany({
      where: {
        taskDate: { gte: today },
        status: { not: null },
        plan: { userId, type },
      },
      select: { taskDate: true },
    });

    await tx.dayTask.deleteMany({
      where: {
        taskDate: { gte: today },
        status: null,
        plan: { userId, type },
      },
    });

    return new Set(kept.map((task) => dateKey(task.taskDate)));
  }

  private async generateFutureWorkoutTasks(
    tx: Prisma.TransactionClient,
    plan: ActivePlan,
    today: Date,
    occupiedDates: Set<string>,
  ): Promise<void> {
    const body = asObject(plan.bodyJson);
    const days = Array.isArray(body.days) ? (body.days as WorkoutDay[]) : [];
    if (days.length === 0) {
      return;
    }

    const tasks: Prisma.DayTaskCreateManyInput[] = [];
    const scheduled = new Set(occupiedDates);
    const cycleLength = Math.max(
      days.length,
      typeof body.days_per_week === 'number' ? body.days_per_week : days.length,
      7,
    );

    for (let week = 0; week < this.weeksAhead; week += 1) {
      for (const [index, dayDef] of days.entries()) {
        const dayOffset = dayDef.day_offset ?? index;
        const taskDate = addUtcDays(today, week * cycleLength + dayOffset);
        const key = dateKey(taskDate);
        if (scheduled.has(key)) {
          continue;
        }
        scheduled.add(key);
        tasks.push({
          planId: plan.id,
          taskDate,
          kind: 'workout',
          title: dayDef.title ?? `Тренировка: ${plan.title}`,
          detailsJson: {
            day_offset: dayOffset,
            description: dayDef.description ?? null,
            exercises: dayDef.exercises ?? [],
          } as Prisma.InputJsonValue,
        });
      }
    }

    if (tasks.length > 0) {
      await tx.dayTask.createMany({ data: tasks });
    }
  }

  private async generateFutureMealTasks(
    tx: Prisma.TransactionClient,
    plan: ActivePlan,
    today: Date,
    dailyCalories: number,
    occupiedDates: Set<string>,
  ): Promise<void> {
    const body = asObject(plan.bodyJson);
    const meals = Array.isArray(body.meals) ? (body.meals as MealItem[]) : [];
    const daysCount = this.weeksAhead * 7;
    const tasks: Prisma.DayTaskCreateManyInput[] = [];
    const scheduled = new Set(occupiedDates);

    for (let day = 0; day < daysCount; day += 1) {
      const taskDate = addUtcDays(today, day);
      const key = dateKey(taskDate);
      if (scheduled.has(key)) {
        continue;
      }
      scheduled.add(key);
      tasks.push({
        planId: plan.id,
        taskDate,
        kind: 'meal',
        title: `Питание: ${plan.title}`,
        detailsJson: {
          daily_calories: dailyCalories,
          description:
            typeof body.description === 'string' ? body.description : null,
          meals,
        } as Prisma.InputJsonValue,
      });
    }

    if (tasks.length > 0) {
      await tx.dayTask.createMany({ data: tasks });
    }
  }

  toActivePlan(plan: ActivePlan): ActivePlanResponse {
    return {
      id: plan.id,
      user_id: plan.userId,
      template_id: plan.templateId,
      type: plan.type,
      title: plan.title,
      level_place: plan.levelPlace,
      body_json: asObject(plan.bodyJson),
      is_active: plan.isActive,
      started_at: plan.startedAt.toISOString(),
      ended_at: plan.endedAt ? plan.endedAt.toISOString() : null,
      daily_calories: plan.dailyCalories,
    };
  }
}

/** Calendar date in the server timezone, stored as a UTC midnight @db.Date. */
function calendarToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
