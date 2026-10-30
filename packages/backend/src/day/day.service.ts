import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivePlan,
  DayTask,
  Prisma,
  TaskStatus,
  TemplateType,
} from '@prisma/client';
import { asObject } from '../catalog/catalog.service';
import { compliancePercent } from '../compliance/compliance.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  addUtcDays,
  calendarToday,
  dateKey,
  diffUtcDays,
  isDayReadonly,
  parseDateParam,
  startOfIsoWeek,
} from './date.util';
import { UpdateDayTasksDto } from './dto/update-day-tasks.dto';

export type DayTaskResponse = {
  id: number;
  plan_id: number;
  task_date: string;
  kind: string;
  title: string;
  status: TaskStatus | null;
  details_json: Record<string, unknown> | null;
  completed_at: string | null;
};

export type DayView = {
  date: string;
  tasks: DayTaskResponse[];
  day_compliance_percent: number | null;
  week_compliance_percent: number | null;
  readonly: boolean;
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
export class DayService {
  private readonly logger = new Logger(DayService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDay(userId: number, dateParam: string): Promise<DayView> {
    const date = this.parseDate(dateParam);
    let tasks = await this.findTasksForDate(userId, date);

    if (tasks.length === 0) {
      await this.generateMissingTasks(userId, date);
      tasks = await this.findTasksForDate(userId, date);
    }

    return this.buildDayView(userId, date, tasks);
  }

  async updateTasks(
    userId: number,
    dateParam: string,
    dto: UpdateDayTasksDto,
  ): Promise<DayView> {
    const date = this.parseDate(dateParam);

    if (isDayReadonly(date)) {
      throw new ForbiddenException({
        message: 'День только для чтения (дата старше 7 дней)',
      });
    }

    const existing = await this.findTasksForDate(userId, date);
    if (existing.length === 0) {
      throw new NotFoundException({ message: 'Задачи на эту дату не найдены' });
    }

    const byId = new Map(existing.map((task) => [task.id, task]));
    const now = new Date();

    for (const item of dto.tasks) {
      if (!byId.has(item.id)) {
        throw new BadRequestException({
          message: `Задача ${item.id} не относится к дате ${dateKey(date)}`,
        });
      }
    }

    await this.prisma.$transaction(
      dto.tasks.map((item) =>
        this.prisma.dayTask.update({
          where: { id: item.id },
          data: {
            status: item.status,
            completedAt: now,
          },
        }),
      ),
    );

    this.logger.log(
      `отметки дня user=${userId} date=${dateKey(date)} updates=${dto.tasks.length}`,
    );

    const tasks = await this.findTasksForDate(userId, date);
    return this.buildDayView(userId, date, tasks);
  }

  private parseDate(dateParam: string): Date {
    try {
      return parseDateParam(dateParam);
    } catch {
      throw new BadRequestException({
        message: 'Дата должна быть в формате YYYY-MM-DD',
      });
    }
  }

  private findTasksForDate(userId: number, date: Date): Promise<DayTask[]> {
    return this.prisma.dayTask.findMany({
      where: {
        taskDate: date,
        plan: { userId },
      },
      orderBy: [{ kind: 'asc' }, { id: 'asc' }],
    });
  }

  private async generateMissingTasks(
    userId: number,
    date: Date,
  ): Promise<void> {
    const plans = await this.prisma.activePlan.findMany({
      where: { userId, isActive: true },
      orderBy: { id: 'asc' },
    });

    const tasks: Prisma.DayTaskCreateManyInput[] = [];

    for (const plan of plans) {
      const start = calendarDateOf(plan.startedAt);
      if (date.getTime() < start.getTime()) {
        continue;
      }

      if (plan.type === TemplateType.workout) {
        const task = this.buildWorkoutTask(plan, date, start);
        if (task) {
          tasks.push(task);
        }
      } else if (plan.type === TemplateType.meal) {
        tasks.push(this.buildMealTask(plan, date));
      }
    }

    if (tasks.length > 0) {
      await this.prisma.dayTask.createMany({ data: tasks });
      this.logger.log(
        `сгенерированы задачи дня user=${userId} date=${dateKey(date)} count=${tasks.length}`,
      );
    }
  }

  private buildWorkoutTask(
    plan: ActivePlan,
    date: Date,
    start: Date,
  ): Prisma.DayTaskCreateManyInput | null {
    const body = asObject(plan.bodyJson);
    const days = Array.isArray(body.days) ? (body.days as WorkoutDay[]) : [];
    if (days.length === 0) {
      return null;
    }

    const cycleLength = Math.max(
      days.length,
      typeof body.days_per_week === 'number' ? body.days_per_week : days.length,
      7,
    );
    const offsetInCycle = diffUtcDays(date, start) % cycleLength;
    const dayDef = days.find(
      (day, index) => (day.day_offset ?? index) === offsetInCycle,
    );
    if (!dayDef) {
      return null;
    }

    return {
      planId: plan.id,
      taskDate: date,
      kind: 'workout',
      title: dayDef.title ?? `Тренировка: ${plan.title}`,
      detailsJson: {
        day_offset: dayDef.day_offset ?? days.indexOf(dayDef),
        description: dayDef.description ?? null,
        exercises: dayDef.exercises ?? [],
      } as Prisma.InputJsonValue,
    };
  }

  private buildMealTask(
    plan: ActivePlan,
    date: Date,
  ): Prisma.DayTaskCreateManyInput {
    const body = asObject(plan.bodyJson);
    const meals = Array.isArray(body.meals) ? (body.meals as MealItem[]) : [];

    return {
      planId: plan.id,
      taskDate: date,
      kind: 'meal',
      title: `Питание: ${plan.title}`,
      detailsJson: {
        daily_calories: plan.dailyCalories,
        description:
          typeof body.description === 'string' ? body.description : null,
        meals,
      } as Prisma.InputJsonValue,
    };
  }

  private async buildDayView(
    userId: number,
    date: Date,
    tasks: DayTask[],
  ): Promise<DayView> {
    const weekStart = startOfIsoWeek(date);
    const weekEnd = addUtcDays(weekStart, 6);

    const weekTasks = await this.prisma.dayTask.findMany({
      where: {
        plan: { userId },
        taskDate: { gte: weekStart, lte: weekEnd },
      },
      select: { status: true },
    });

    return {
      date: dateKey(date),
      tasks: tasks.map((task) => this.toTask(task)),
      day_compliance_percent: compliancePercent(tasks),
      week_compliance_percent: compliancePercent(weekTasks),
      readonly: isDayReadonly(date, calendarToday()),
    };
  }

  private toTask(task: DayTask): DayTaskResponse {
    return {
      id: task.id,
      plan_id: task.planId,
      task_date: dateKey(task.taskDate),
      kind: task.kind,
      title: task.title,
      status: task.status,
      details_json: asObjectOrNull(task.detailsJson),
      completed_at: task.completedAt ? task.completedAt.toISOString() : null,
    };
  }
}

function calendarDateOf(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function asObjectOrNull(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  return asObject(value);
}
