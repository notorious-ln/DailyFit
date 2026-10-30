import {
  AssistantSource,
  RecommendationStatus,
  TaskStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService', () => {
  const today = new Date('2026-10-30T00:00:00.000Z');
  const futureDate = new Date('2026-10-31T00:00:00.000Z');

  const draftItems = [
    {
      id: 'rec-1',
      title: 'День B: меньше подходов',
      description:
        'Задача: «День B» (2026-10-31). Изменение: уменьшить подходы. Причина: пропуски.',
      selected: false,
      change: {
        kind: 'sets' as const,
        direction: 'ease' as const,
        taskId: 20,
        exerciseIndex: 0,
        fromSets: 3,
        toSets: 2,
        volumeDeltaSets: -1,
      },
    },
    {
      id: 'rec-2',
      title: 'День B: проще упражнение',
      description:
        'Задача: «День B» (2026-10-31). Изменение: заменить. Причина: пропуски.',
      selected: false,
      change: {
        kind: 'simplify_exercise' as const,
        direction: 'ease' as const,
        taskId: 20,
        exerciseIndex: 1,
        fromName: 'Отжимания с паузой',
        toName: 'Отжимания',
        volumeDeltaSets: 0,
      },
    },
  ];

  function setup() {
    const task = {
      id: 20,
      planId: 4,
      title: 'День B',
      kind: 'workout',
      status: null as TaskStatus | null,
      taskDate: futureDate,
      detailsJson: {
        day_offset: 1,
        exercises: [
          { name: 'Приседания', sets: 3, reps: 12 },
          { name: 'Отжимания с паузой', sets: 3, reps: 8 },
        ],
      },
      completedAt: null,
    };

    const recommendation = {
      id: 7,
      userId: 1,
      periodFrom: new Date('2026-10-26T00:00:00.000Z'),
      periodTo: new Date('2026-11-01T00:00:00.000Z'),
      source: AssistantSource.rules,
      status: RecommendationStatus.draft,
      summaryText: 'Разбор',
      itemsJson: draftItems,
      createdAt: new Date('2026-10-30T12:00:00.000Z'),
    };

    const dayTaskUpdate = jest.fn(({ where, data }) =>
      Promise.resolve({ ...task, ...data, id: where.id }),
    );
    const activePlanUpdate = jest.fn().mockResolvedValue({});
    const recommendationUpdate = jest.fn(({ data }) =>
      Promise.resolve({ ...recommendation, ...data }),
    );

    const tx = {
      dayTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...task,
            id: 1,
            taskDate: new Date('2026-10-27T00:00:00.000Z'),
            status: TaskStatus.done,
            detailsJson: {
              exercises: [{ name: 'Приседания', sets: 10, reps: 10 }],
            },
          },
          task,
        ]),
        findFirst: jest.fn().mockImplementation((args: { where: { id?: number; taskDate?: Date } }) => {
          if (args.where.taskDate) {
            return Promise.resolve(null);
          }
          if (args.where.id === 20) {
            return Promise.resolve(task);
          }
          return Promise.resolve(null);
        }),
        update: dayTaskUpdate,
      },
      activePlan: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          bodyJson: {
            days: [
              { day_offset: 0, title: 'День A', exercises: [] },
              {
                day_offset: 1,
                title: 'День B',
                exercises: task.detailsJson.exercises,
              },
            ],
          },
        }),
        update: activePlanUpdate,
      },
      recommendation: {
        update: recommendationUpdate,
      },
    };

    const prisma = {
      recommendation: {
        findFirst: jest.fn().mockResolvedValue(recommendation),
        update: recommendationUpdate,
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 1,
        gender: 'female',
        age: 30,
        heightCm: 170,
        weightKg: 65,
        workoutsPerWeek: 3,
        goal: 2,
      }),
    };

    const service = new RecommendationsService(
      prisma as never,
      usersService as never,
    );
    return {
      service,
      prisma,
      tx,
      dayTaskUpdate,
      recommendationUpdate,
      activePlanUpdate,
      recommendation,
      task,
    };
  }

  it('rejects a draft without changing the plan', async () => {
    const { service, prisma, recommendationUpdate, dayTaskUpdate } = setup();

    const result = await service.decide(1, 7, { action: 'reject' });

    expect(result.status).toBe(RecommendationStatus.rejected);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(recommendationUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: RecommendationStatus.rejected },
    });
    expect(dayTaskUpdate).not.toHaveBeenCalled();
  });

  it('accepts all items when selectedItems is omitted', async () => {
    const { service, dayTaskUpdate, recommendationUpdate } = setup();

    const result = await service.decide(1, 7, { action: 'accept' });

    expect(result.status).toBe(RecommendationStatus.accepted);
    expect(dayTaskUpdate).toHaveBeenCalled();
    expect(recommendationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RecommendationStatus.accepted,
        }),
      }),
    );
  });

  it('refuses a recommendation that is no longer a draft', async () => {
    const { service, prisma, recommendation } = setup();
    recommendation.status = RecommendationStatus.accepted;

    await expect(
      service.decide(1, 7, { action: 'accept' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts selected items and updates a future unmarked task', async () => {
    const { service, dayTaskUpdate, recommendationUpdate, activePlanUpdate } =
      setup();

    const result = await service.decide(1, 7, {
      action: 'accept',
      selectedItems: ['rec-1'],
    });

    expect(result.status).toBe(RecommendationStatus.partially_accepted);
    expect(dayTaskUpdate).toHaveBeenCalled();
    const updateArg = dayTaskUpdate.mock.calls[0][0];
    expect(updateArg.data.detailsJson.exercises[0].sets).toBe(2);
    expect(activePlanUpdate).toHaveBeenCalled();
    expect(recommendationUpdate).toHaveBeenCalled();
  });

  it('does not rewrite a past or already marked task', async () => {
    const { service, tx, recommendationUpdate } = setup();
    tx.dayTask.findFirst.mockResolvedValue({
      id: 20,
      planId: 4,
      title: 'День B',
      kind: 'workout',
      status: TaskStatus.done,
      taskDate: today,
      detailsJson: {
        exercises: [{ name: 'Приседания', sets: 3, reps: 12 }],
      },
      completedAt: new Date(),
    });

    await expect(
      service.decide(1, 7, { action: 'accept', selectedItems: ['rec-1'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(recommendationUpdate).not.toHaveBeenCalled();
  });

  it('rejects accept when selected items exceed the 15% volume limit', async () => {
    const { service, tx, recommendation } = setup();
    recommendation.itemsJson = [
      {
        ...draftItems[0],
        id: 'big',
        change: { ...draftItems[0].change, volumeDeltaSets: -5 },
      },
    ];
    tx.dayTask.findMany.mockResolvedValue([
      {
        id: 1,
        planId: 4,
        title: 'A',
        kind: 'workout',
        status: TaskStatus.done,
        taskDate: new Date('2026-10-27T00:00:00.000Z'),
        detailsJson: {
          exercises: [{ name: 'Приседания', sets: 10, reps: 10 }],
        },
      },
    ]);

    await expect(
      service.decide(1, 7, { action: 'accept', selectedItems: ['big'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('applies a calorie shift to the active meal plan and future unmarked tasks', async () => {
    const { service, tx, dayTaskUpdate, activePlanUpdate, recommendation } =
      setup();
    const mealTask = {
      id: 30,
      planId: 8,
      title: 'Питание: план',
      kind: 'meal',
      status: null as TaskStatus | null,
      taskDate: futureDate,
      detailsJson: {
        daily_calories: 2000,
        meals: [{ name: 'Обед', examples: ['Курица', 'Рис'] }],
      },
      completedAt: null,
    };
    recommendation.itemsJson = [
      {
        id: 'meal-1',
        title: 'Питание: меньше калорий',
        description: 'Задача. Изменение. Причина.',
        selected: false,
        change: {
          kind: 'shift_calories' as const,
          direction: 'ease' as const,
          taskId: 30,
          planId: 8,
          fromCalories: 2000,
          toCalories: 1800,
          calorieDelta: -200,
          volumeDeltaSets: 0,
        },
      },
    ];
    tx.activePlan.findFirst.mockResolvedValue({
      id: 8,
      dailyCalories: 2000,
      bodyJson: {
        meals: [{ name: 'Обед', examples: ['Курица', 'Рис'] }],
      },
    });
    tx.dayTask.findMany.mockImplementation((args: { where?: { kind?: string } }) => {
      if (args.where?.kind === 'meal') {
        return Promise.resolve([mealTask]);
      }
      return Promise.resolve([]);
    });

    const result = await service.decide(1, 7, {
      action: 'accept',
      selectedItems: ['meal-1'],
    });

    expect(result.status).toBe(RecommendationStatus.accepted);
    expect(activePlanUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 8 },
        data: expect.objectContaining({ dailyCalories: 1800 }),
      }),
    );
    expect(dayTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 30 },
        data: expect.objectContaining({
          detailsJson: expect.objectContaining({ daily_calories: 1800 }),
        }),
      }),
    );
  });
});
