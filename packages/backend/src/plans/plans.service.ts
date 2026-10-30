import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivePlan,
  Prisma,
  Template,
  TemplateType,
} from '@prisma/client';
import { asObject } from '../catalog/catalog.service';
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
  ) {}

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

    const current = await this.prisma.activePlan.findFirst({
      where: {
        userId,
        type: TemplateType.workout,
        isActive: true,
      },
    });

    if (current && !dto.confirmReplace) {
      throw new ConflictException({
        message: 'Уже есть активный план тренировок. Подтвердите замену.',
        current_plan_id: current.id,
        requires_confirm: true,
      } satisfies PlanReplaceWarning);
    }

    const plan = await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.activePlan.update({
          where: { id: current.id },
          data: {
            isActive: false,
            endedAt: new Date(),
          },
        });
      }

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

      await this.generateFutureWorkoutTasks(tx, created, template);

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

    const current = await this.prisma.activePlan.findFirst({
      where: {
        userId,
        type: TemplateType.meal,
        isActive: true,
      },
    });

    const plan = await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.activePlan.update({
          where: { id: current.id },
          data: {
            isActive: false,
            endedAt: new Date(),
          },
        });
      }

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

      await this.generateFutureMealTasks(tx, created, template, dailyCalories);

      return created;
    });

    this.logger.log(
      `активация meal-плана user=${userId} plan=${plan.id} template=${template.id} kcal=${dailyCalories}`,
    );

    return this.toActivePlan(plan);
  }

  private async generateFutureWorkoutTasks(
    tx: Prisma.TransactionClient,
    plan: ActivePlan,
    template: Template,
  ): Promise<void> {
    const body = asObject(template.bodyJson);
    const days = Array.isArray(body.days) ? (body.days as WorkoutDay[]) : [];
    if (days.length === 0) {
      return;
    }

    const today = startOfUtcDay(new Date());
    const tasks: Prisma.DayTaskCreateManyInput[] = [];
    const cycleLength = Math.max(
      days.length,
      typeof body.days_per_week === 'number' ? body.days_per_week : days.length,
      7,
    );

    for (let week = 0; week < this.weeksAhead; week += 1) {
      for (const [index, dayDef] of days.entries()) {
        const dayOffset = dayDef.day_offset ?? index;
        const taskDate = addUtcDays(today, week * cycleLength + dayOffset);
        tasks.push({
          planId: plan.id,
          taskDate,
          kind: 'workout',
          title: dayDef.title ?? `Тренировка: ${template.title}`,
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
    template: Template,
    dailyCalories: number,
  ): Promise<void> {
    const body = asObject(template.bodyJson);
    const meals = Array.isArray(body.meals) ? (body.meals as MealItem[]) : [];
    const today = startOfUtcDay(new Date());
    const daysCount = this.weeksAhead * 7;
    const tasks: Prisma.DayTaskCreateManyInput[] = [];

    for (let day = 0; day < daysCount; day += 1) {
      tasks.push({
        planId: plan.id,
        taskDate: addUtcDays(today, day),
        kind: 'meal',
        title: `Питание: ${template.title}`,
        detailsJson: {
          daily_calories: dailyCalories,
          description: typeof body.description === 'string' ? body.description : null,
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
      is_active: plan.isActive,
      started_at: plan.startedAt.toISOString(),
      ended_at: plan.endedAt ? plan.endedAt.toISOString() : null,
      daily_calories: plan.dailyCalories,
    };
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
