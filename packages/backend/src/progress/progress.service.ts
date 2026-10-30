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
};

export type WeightPoint = {
  date: string;
  weight_kg: number;
};

export type WeekProgress = {
  empty: boolean;
  workout_percent: number | null;
  meal_percent: number | null;
  skips: ProgressSkip[];
  weight_series: WeightPoint[];
};

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async getWeekProgress(
    userId: number,
    query: WeekProgressQueryDto,
  ): Promise<WeekProgress> {
    const { from, to } = this.resolvePeriod(query);

    const [tasks, diaryNotes] = await Promise.all([
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
    ]);

    const weight_series: WeightPoint[] = diaryNotes
      .filter((note) => note.weightKg != null)
      .map((note) => ({
        date: dateKey(note.noteDate),
        weight_kg: note.weightKg as number,
      }));

    const hasMarks = tasks.some((task) => task.status != null);
    if (!hasMarks) {
      return {
        empty: true,
        workout_percent: null,
        meal_percent: null,
        skips: [],
        weight_series,
      };
    }

    const workouts = tasks.filter((task) => task.kind === 'workout');
    const meals = tasks.filter((task) => task.kind === 'meal');

    const skips: ProgressSkip[] = tasks
      .filter((task) => task.status === TaskStatus.skipped)
      .map((task) => ({
        date: dateKey(task.taskDate),
        title: task.title,
        kind: task.kind,
      }));

    return {
      empty: false,
      workout_percent: compliancePercent(workouts),
      meal_percent: compliancePercent(meals),
      skips,
      weight_series,
    };
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
