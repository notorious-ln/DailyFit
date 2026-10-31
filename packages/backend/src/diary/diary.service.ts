import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DiaryNote, Feeling, TaskStatus } from '@prisma/client';
import { compliancePercent } from '../compliance/compliance.util';
import {
  addUtcDays,
  calendarToday,
  dateKey,
  parseDateParam,
  startOfIsoWeek,
} from '../day/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertDiaryDto } from './dto/upsert-diary.dto';
import { WeekDiaryQueryDto } from './dto/week-diary-query.dto';

export type DiaryNoteResponse = {
  id: number;
  user_id: number;
  note_date: string;
  feeling: Feeling;
  weight_kg: number | null;
  user_comment: string | null;
  advisor_comment: string | null;
};

export type DiaryDayItem = {
  date: string;
  has_note: boolean;
  feeling: Feeling | null;
  weight_kg: number | null;
  user_comment: string | null;
  advisor_comment: string | null;
  day_compliance_percent: number | null;
};

export type DiaryWeekResponse = {
  from: string;
  to: string;
  days: DiaryDayItem[];
  notes_count: number;
  dominant_feeling: Feeling | null;
  last_weight_kg: number | null;
};

@Injectable()
export class DiaryService {
  private readonly logger = new Logger(DiaryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getWeek(
    userId: number,
    query: WeekDiaryQueryDto,
  ): Promise<DiaryWeekResponse> {
    const { from, to } = this.resolvePeriod(query);

    const [notes, tasks] = await Promise.all([
      this.prisma.diaryNote.findMany({
        where: {
          userId,
          noteDate: { gte: from, lte: to },
        },
        orderBy: { noteDate: 'asc' },
      }),
      this.prisma.dayTask.findMany({
        where: {
          plan: { userId },
          taskDate: { gte: from, lte: to },
        },
        select: {
          taskDate: true,
          status: true,
        },
      }),
    ]);

    const notesByDate = new Map(
      notes.map((note) => [dateKey(note.noteDate), note]),
    );
    const tasksByDate = new Map<string, Array<{ status: TaskStatus | null }>>();
    for (const task of tasks) {
      const key = dateKey(task.taskDate);
      const list = tasksByDate.get(key) ?? [];
      list.push({ status: task.status });
      tasksByDate.set(key, list);
    }

    const days: DiaryDayItem[] = [];
    for (
      let cursor = new Date(from);
      cursor.getTime() <= to.getTime();
      cursor = addUtcDays(cursor, 1)
    ) {
      const key = dateKey(cursor);
      const note = notesByDate.get(key);
      const dayTasks = tasksByDate.get(key) ?? [];
      const hasMarks = dayTasks.some((task) => task.status != null);
      days.push({
        date: key,
        has_note: Boolean(note),
        feeling: note?.feeling ?? null,
        weight_kg: note?.weightKg ?? null,
        user_comment: note?.userComment ?? null,
        advisor_comment: note?.advisorComment ?? null,
        day_compliance_percent:
          dayTasks.length === 0 || !hasMarks
            ? null
            : compliancePercent(dayTasks),
      });
    }

    const feelingCounts = new Map<Feeling, number>();
    for (const note of notes) {
      feelingCounts.set(
        note.feeling,
        (feelingCounts.get(note.feeling) ?? 0) + 1,
      );
    }
    let dominant_feeling: Feeling | null = null;
    let dominantCount = 0;
    for (const [feeling, count] of feelingCounts) {
      if (count > dominantCount) {
        dominant_feeling = feeling;
        dominantCount = count;
      }
    }

    const withWeight = notes.filter((note) => note.weightKg != null);
    const last_weight_kg =
      withWeight.length > 0
        ? (withWeight[withWeight.length - 1].weightKg as number)
        : null;

    return {
      from: dateKey(from),
      to: dateKey(to),
      days,
      notes_count: notes.length,
      dominant_feeling,
      last_weight_kg,
    };
  }

  async getByDate(
    userId: number,
    dateParam: string,
  ): Promise<DiaryDayItem> {
    const date = this.parseDate(dateParam);
    const [note, tasks] = await Promise.all([
      this.prisma.diaryNote.findUnique({
        where: {
          userId_noteDate: {
            userId,
            noteDate: date,
          },
        },
      }),
      this.prisma.dayTask.findMany({
        where: {
          plan: { userId },
          taskDate: date,
        },
        select: { status: true },
      }),
    ]);

    const hasMarks = tasks.some((task) => task.status != null);
    return {
      date: dateKey(date),
      has_note: Boolean(note),
      feeling: note?.feeling ?? null,
      weight_kg: note?.weightKg ?? null,
      user_comment: note?.userComment ?? null,
      advisor_comment: note?.advisorComment ?? null,
      day_compliance_percent:
        tasks.length === 0 || !hasMarks ? null : compliancePercent(tasks),
    };
  }

  async upsert(
    userId: number,
    dateParam: string,
    dto: UpsertDiaryDto,
  ): Promise<DiaryNoteResponse> {
    const noteDate = this.parseDate(dateParam);
    const weightKg = dto.weight_kg ?? null;
    const userComment = dto.user_comment ?? null;

    const note = await this.prisma.diaryNote.upsert({
      where: {
        userId_noteDate: {
          userId,
          noteDate,
        },
      },
      create: {
        userId,
        noteDate,
        feeling: dto.feeling,
        weightKg,
        userComment,
      },
      update: {
        feeling: dto.feeling,
        weightKg,
        userComment,
      },
    });

    this.logger.log(
      `дневник сохранён user=${userId} date=${dateKey(noteDate)} feeling=${dto.feeling}`,
    );

    return this.toResponse(note);
  }

  private resolvePeriod(query: WeekDiaryQueryDto): { from: Date; to: Date } {
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

  private parseDate(dateParam: string): Date {
    try {
      return parseDateParam(dateParam);
    } catch {
      throw new BadRequestException({
        message: 'Дата должна быть в формате YYYY-MM-DD',
      });
    }
  }

  private toResponse(note: DiaryNote): DiaryNoteResponse {
    return {
      id: note.id,
      user_id: note.userId,
      note_date: dateKey(note.noteDate),
      feeling: note.feeling,
      weight_kg: note.weightKg,
      user_comment: note.userComment,
      advisor_comment: note.advisorComment,
    };
  }
}
