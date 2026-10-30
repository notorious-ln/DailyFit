import { BadRequestException } from '@nestjs/common';
import {
  AssistantSource,
  RecommendationStatus,
  TaskStatus,
} from '@prisma/client';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  function item(id: string, selected: boolean, title = `Пункт ${id}`) {
    return {
      id,
      title,
      description: `Описание ${id}`,
      selected,
      change: {
        kind: 'sets' as const,
        direction: 'ease' as const,
        taskId: 1,
        volumeDeltaSets: -1,
      },
    };
  }

  function recommendation(
    id: number,
    status: RecommendationStatus,
    items: ReturnType<typeof item>[],
  ) {
    return {
      id,
      userId: 1,
      periodFrom: new Date('2026-10-06T00:00:00.000Z'),
      periodTo: new Date('2026-10-12T00:00:00.000Z'),
      source: AssistantSource.rules,
      status,
      summaryText: 'Разбор',
      itemsJson: items,
      createdAt: new Date('2026-10-12T12:00:00.000Z'),
    };
  }

  function setup(options?: {
    workouts?: Array<{ status: TaskStatus | null }>;
    notes?: Array<{ noteDate: Date; weightKg: number | null }>;
    recommendations?: ReturnType<typeof recommendation>[];
  }) {
    const dayTaskFindMany = jest
      .fn()
      .mockResolvedValue(options?.workouts ?? []);
    const diaryFindMany = jest.fn().mockResolvedValue(options?.notes ?? []);
    const recommendationFindMany = jest
      .fn()
      .mockResolvedValue(options?.recommendations ?? []);

    const prisma = {
      dayTask: { findMany: dayTaskFindMany },
      diaryNote: { findMany: diaryFindMany },
      recommendation: { findMany: recommendationFindMany },
    };

    return {
      service: new ReportsService(prisma as never),
      dayTaskFindMany,
      diaryFindMany,
      recommendationFindMany,
    };
  }

  it('returns percent, workout count, entered weight and accepted adjustments', async () => {
    const { service } = setup({
      workouts: [
        { status: TaskStatus.done },
        { status: TaskStatus.partial },
        { status: TaskStatus.skipped },
        { status: null },
      ],
      notes: [
        { noteDate: new Date('2026-10-02T00:00:00.000Z'), weightKg: 80.5 },
        { noteDate: new Date('2026-10-20T00:00:00.000Z'), weightKg: 79.2 },
      ],
      recommendations: [
        recommendation(3, RecommendationStatus.accepted, [
          item('a', true, 'Меньше подходов'),
          item('b', true, 'Проще упражнение'),
        ]),
        recommendation(4, RecommendationStatus.partially_accepted, [
          item('c', true, 'Перенос'),
          item('d', false, 'Не принят'),
        ]),
      ],
    });

    const report = await service.getPeriodReport(1, {
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(report).toEqual({
      period_from: '2026-10-01',
      period_to: '2026-10-31',
      percent: 37.5,
      workout_count: 4,
      weights: [
        { date: '2026-10-02', weight_kg: 80.5 },
        { date: '2026-10-20', weight_kg: 79.2 },
      ],
      adjustments: [
        {
          recommendation_id: 3,
          status: 'accepted',
          period_from: '2026-10-06',
          period_to: '2026-10-12',
          title: 'Меньше подходов',
          description: 'Описание a',
        },
        {
          recommendation_id: 3,
          status: 'accepted',
          period_from: '2026-10-06',
          period_to: '2026-10-12',
          title: 'Проще упражнение',
          description: 'Описание b',
        },
        {
          recommendation_id: 4,
          status: 'partially_accepted',
          period_from: '2026-10-06',
          period_to: '2026-10-12',
          title: 'Перенос',
          description: 'Описание c',
        },
      ],
    });
  });

  it('returns an empty on-screen report when the period has no data', async () => {
    const { service, dayTaskFindMany, recommendationFindMany } = setup();

    const report = await service.getPeriodReport(7, {
      from: '2026-10-01',
      to: '2026-10-07',
    });

    expect(report).toEqual({
      period_from: '2026-10-01',
      period_to: '2026-10-07',
      percent: null,
      workout_count: 0,
      weights: [],
      adjustments: [],
    });
    expect(dayTaskFindMany).toHaveBeenCalledWith({
      where: {
        kind: 'workout',
        plan: { userId: 7 },
        taskDate: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lte: new Date('2026-10-07T00:00:00.000Z'),
        },
      },
      select: { status: true },
    });
    expect(recommendationFindMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        status: {
          in: [
            RecommendationStatus.accepted,
            RecommendationStatus.partially_accepted,
          ],
        },
        periodFrom: { lte: new Date('2026-10-07T00:00:00.000Z') },
        periodTo: { gte: new Date('2026-10-01T00:00:00.000Z') },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('rejects a period where from is after to', async () => {
    const { service } = setup();
    await expect(
      service.getPeriodReport(1, { from: '2026-10-31', to: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a calendar-invalid date', async () => {
    const { service } = setup();
    await expect(
      service.getPeriodReport(1, { from: '2026-02-31', to: '2026-03-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
