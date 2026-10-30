import { BadRequestException, Injectable } from '@nestjs/common';
import { Recommendation, RecommendationStatus } from '@prisma/client';
import { compliancePercent } from '../compliance/compliance.util';
import { dateKey, parseDateParam } from '../day/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { parseRecommendationItems } from '../recommendations/recommendation.mapper';
import { PeriodReportQueryDto } from './dto/period-report-query.dto';

export type PeriodReportWeight = {
  date: string;
  weight_kg: number;
};

export type PeriodReportAdjustment = {
  recommendation_id: number;
  status: 'accepted' | 'partially_accepted';
  period_from: string;
  period_to: string;
  title: string;
  description: string;
};

export type PeriodReport = {
  period_from: string;
  period_to: string;
  percent: number | null;
  workout_count: number;
  weights: PeriodReportWeight[];
  adjustments: PeriodReportAdjustment[];
};

const ACCEPTED_STATUSES: RecommendationStatus[] = [
  RecommendationStatus.accepted,
  RecommendationStatus.partially_accepted,
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPeriodReport(
    userId: number,
    query: PeriodReportQueryDto,
  ): Promise<PeriodReport> {
    const from = this.parseDate(query.from);
    const to = this.parseDate(query.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException({
        message: 'from не может быть позже to',
      });
    }

    const [workouts, diaryNotes, recommendations] = await Promise.all([
      this.prisma.dayTask.findMany({
        where: {
          kind: 'workout',
          plan: { userId },
          taskDate: { gte: from, lte: to },
        },
        select: { status: true },
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
      this.prisma.recommendation.findMany({
        where: {
          userId,
          status: { in: ACCEPTED_STATUSES },
          periodFrom: { lte: to },
          periodTo: { gte: from },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const weights: PeriodReportWeight[] = diaryNotes
      .filter((note) => note.weightKg != null)
      .map((note) => ({
        date: dateKey(note.noteDate),
        weight_kg: note.weightKg as number,
      }));

    return {
      period_from: dateKey(from),
      period_to: dateKey(to),
      percent: compliancePercent(workouts),
      workout_count: workouts.length,
      weights,
      adjustments: recommendations.flatMap((row) =>
        this.acceptedAdjustments(row),
      ),
    };
  }

  private acceptedAdjustments(row: Recommendation): PeriodReportAdjustment[] {
    const items = parseRecommendationItems(row.itemsJson);
    const picked = items.filter((item) => item.selected);
    const applied =
      row.status === RecommendationStatus.partially_accepted
        ? picked
        : picked.length > 0
          ? picked
          : items;

    return applied.map((item) => ({
      recommendation_id: row.id,
      status:
        row.status === RecommendationStatus.partially_accepted
          ? 'partially_accepted'
          : 'accepted',
      period_from: dateKey(row.periodFrom),
      period_to: dateKey(row.periodTo),
      title: item.title,
      description: item.description,
    }));
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
