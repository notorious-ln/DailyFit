import { BadRequestException, Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { compliancePercent } from '../compliance/compliance.util';
import {
  addUtcDays,
  calendarToday,
  dateKey,
  parseDateParam,
  startOfIsoWeek,
} from '../day/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { WeekProgressQueryDto } from './dto/week-progress-query.dto';

export type ProgressSkip = {
  date: string;
  title: string;
  kind: string;
  status: 'skipped' | 'partial';
};

export type WeightPoint = {
  date: string;
  weight_kg: number;
};

export type DayCompliance = {
  date: string;
  percent: number | null;
};

export type WeekProgress = {
  empty: boolean;
  from: string;
  to: string;
  overall_percent: number | null;
  previous_overall_percent: number | null;
  overall_delta: number | null;
  workout_percent: number | null;
  meal_percent: number | null;
  workout_done: number;
  workout_partial: number;
  workout_total: number;
  current_weight_kg: number | null;
  weight_delta_kg: number | null;
  days: DayCompliance[];
  skips: ProgressSkip[];
  weight_series: WeightPoint[];
};

type TaskRow = {
  taskDate: Date;
  title: string;
  kind: string;
  status: TaskStatus | null;
};

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getWeekProgress(
    userId: number,
    query: WeekProgressQueryDto,
  ): Promise<WeekProgress> {
    const { from, to } = this.resolvePeriod(query);
    const prevTo = addUtcDays(from, -1);
    const prevFrom = addUtcDays(prevTo, -6);

    const [tasks, diaryNotes, previousTasks] = await Promise.all([
      this.prisma.dayTask.findMany({
        where: {
          plan: { userId },
          taskDate: { gte: from, lte: to },
        },
        orderBy: [{ taskDate: 'asc' }, { id: 'asc' }],
        select: {
          taskDate: true,
          title: true,
          kind: true,
          status: true,
        },
      }),
      this.prisma.diaryNote.findMany({
        where: {
          userId,
          noteDate: { gte: from, lte: to },
          weightKg: { not: null },
        },
        orderBy: { noteDate: 'asc' },
        select: { noteDate: true, weightKg: true },
      }),
      this.prisma.dayTask.findMany({
        where: {
          plan: { userId },
          taskDate: { gte: prevFrom, lte: prevTo },
        },
        select: { status: true },
      }),
    ]);

    return this.buildWeekProgress(from, to, tasks, diaryNotes, previousTasks);
  }

  private buildWeekProgress(
    from: Date,
    to: Date,
    tasks: TaskRow[],
    diaryNotes: Array<{ noteDate: Date; weightKg: number | null }>,
    previousTasks: Array<{ status: TaskStatus | null }>,
  ): WeekProgress {
    const weight_series: WeightPoint[] = diaryNotes
      .filter((note) => note.weightKg != null)
      .map((note) => ({
        date: dateKey(note.noteDate),
        weight_kg: note.weightKg as number,
      }));

    const current_weight_kg =
      weight_series.length > 0
        ? weight_series[weight_series.length - 1].weight_kg
        : null;
    const weight_delta_kg =
      weight_series.length >= 2
        ? Math.round(
            (weight_series[weight_series.length - 1].weight_kg -
              weight_series[0].weight_kg) *
              10,
          ) / 10
        : null;

    const days = this.buildDaySeries(from, to, tasks);
    const workouts = tasks.filter((task) => task.kind === 'workout');
    const meals = tasks.filter((task) => task.kind === 'meal');
    const hasMarks = tasks.some((task) => task.status != null);

    const overall_percent = hasMarks ? compliancePercent(tasks) : null;
    const previous_overall_percent = previousTasks.some(
      (task) => task.status != null,
    )
      ? compliancePercent(previousTasks)
      : null;
    const overall_delta =
      overall_percent != null && previous_overall_percent != null
        ? Math.round((overall_percent - previous_overall_percent) * 10) / 10
        : null;

    const skips: ProgressSkip[] = tasks
      .filter(
        (task) =>
          task.status === TaskStatus.skipped ||
          task.status === TaskStatus.partial,
      )
      .map((task) => ({
        date: dateKey(task.taskDate),
        title: task.title,
        kind: task.kind,
        status: task.status === TaskStatus.partial ? 'partial' : 'skipped',
      }));

    if (!hasMarks) {
      return {
        empty: true,
        from: dateKey(from),
        to: dateKey(to),
        overall_percent: null,
        previous_overall_percent,
        overall_delta: null,
        workout_percent: null,
        meal_percent: null,
        workout_done: 0,
        workout_partial: 0,
        workout_total: workouts.length,
        current_weight_kg,
        weight_delta_kg,
        days,
        skips: [],
        weight_series,
      };
    }

    return {
      empty: false,
      from: dateKey(from),
      to: dateKey(to),
      overall_percent,
      previous_overall_percent,
      overall_delta,
      workout_percent: compliancePercent(workouts),
      meal_percent: compliancePercent(meals),
      workout_done: workouts.filter((task) => task.status === TaskStatus.done)
        .length,
      workout_partial: workouts.filter(
        (task) => task.status === TaskStatus.partial,
      ).length,
      workout_total: workouts.length,
      current_weight_kg,
      weight_delta_kg,
      days,
      skips,
      weight_series,
    };
  }

  private buildDaySeries(
    from: Date,
    to: Date,
    tasks: TaskRow[],
  ): DayCompliance[] {
    const byDate = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      const key = dateKey(task.taskDate);
      const list = byDate.get(key) ?? [];
      list.push(task);
      byDate.set(key, list);
    }

    const days: DayCompliance[] = [];
    for (
      let cursor = new Date(from);
      cursor.getTime() <= to.getTime();
      cursor = addUtcDays(cursor, 1)
    ) {
      const key = dateKey(cursor);
      const dayTasks = byDate.get(key) ?? [];
      const hasMarks = dayTasks.some((task) => task.status != null);
      days.push({
        date: key,
        percent:
          dayTasks.length === 0 || !hasMarks
            ? null
            : compliancePercent(dayTasks),
      });
    }
    return days;
  }

  private resolvePeriod(query: WeekProgressQueryDto): {
    from: Date;
    to: Date;
  } {
    if (query.from && query.to) {
      const from = this.parseDate(query.from);
      const to = this.parseDate(query.to);
      if (from.getTime() > to.getTime()) {
        throw new BadRequestException({
          message: 'from не может быть позже to',
        });
      }
      return { from, to };
    }

    if (query.from || query.to) {
      throw new BadRequestException({
        message: 'Укажите оба параметра from и to, либо ни одного',
      });
    }

    const weekStart = startOfIsoWeek(calendarToday());
    return {
      from: weekStart,
      to: addUtcDays(weekStart, 6),
    };
  }

  private parseDate(value: string): Date {
    try {
      return parseDateParam(value);
    } catch {
      throw new BadRequestException({
        message: 'Дата должна быть в формате YYYY-MM-DD',
      });
    }
  }
}
