import { Feeling, TaskStatus } from '@prisma/client';
import {
  SIMPLER_EXERCISE,
  WorkoutTaskInput,
  absoluteVolumeDelta,
  buildWorkoutRecommendations,
  filterItemsByVolume,
  maxVolumeDeltaSets,
  workoutVolumeSets,
} from './rules-workout-recs';

function workout(
  partial: Partial<WorkoutTaskInput> & { id: number; taskDate: Date },
): WorkoutTaskInput {
  return {
    planId: 1,
    title: partial.title ?? `Тренировка ${partial.id}`,
    status: partial.status ?? null,
    detailsJson: partial.detailsJson ?? {
      exercises: [
        { name: 'Приседания', sets: 3, reps: 12 },
        { name: 'Отжимания с паузой', sets: 3, reps: 10 },
      ],
    },
    ...partial,
  };
}

describe('rules-workout-recs', () => {
  const today = new Date('2026-10-30T00:00:00.000Z');
  const periodTo = today;
  const periodFrom = new Date('2026-10-24T00:00:00.000Z');

  it('builds ease items with task, change and reason, and blocks harden after 2 skips', () => {
    const recent = [
      workout({
        id: 1,
        taskDate: new Date('2026-10-24T00:00:00.000Z'),
        status: TaskStatus.skipped,
      }),
      workout({
        id: 2,
        taskDate: new Date('2026-10-26T00:00:00.000Z'),
        status: TaskStatus.skipped,
      }),
      workout({
        id: 3,
        taskDate: new Date('2026-10-28T00:00:00.000Z'),
        status: TaskStatus.done,
      }),
    ];
    const future = [
      workout({
        id: 10,
        taskDate: new Date('2026-10-31T00:00:00.000Z'),
        title: 'День A',
      }),
    ];

    const items = buildWorkoutRecommendations({
      periodFrom,
      periodTo,
      today,
      recentWorkouts: recent,
      weekWorkouts: [...recent, ...future],
      futureWorkouts: future,
      feelings: [{ feeling: Feeling.easy }],
    });

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.change.direction !== 'harden')).toBe(
      true,
    );
    for (const item of items) {
      expect(item.description).toContain('Задача:');
      expect(item.description).toContain('Изменение:');
      expect(item.description).toContain('Причина:');
      expect(item.description).toMatch(/пропущено тренировок: 2/);
    }
    expect(
      items.some((item) => item.change.kind === 'simplify_exercise'),
    ).toBe(true);
    expect(
      items.find((item) => item.change.kind === 'simplify_exercise')?.change
        .toName,
    ).toBe(SIMPLER_EXERCISE['Отжимания с паузой']);
  });

  it('does not invent a simplify target outside the dictionary', () => {
    const future = [
      workout({
        id: 10,
        taskDate: new Date('2026-10-31T00:00:00.000Z'),
        detailsJson: {
          exercises: [{ name: 'Неизвестное движение', sets: 3, reps: 10 }],
        },
      }),
    ];
    const recent = [
      workout({
        id: 1,
        taskDate: new Date('2026-10-25T00:00:00.000Z'),
        status: TaskStatus.skipped,
      }),
      workout({
        id: 2,
        taskDate: new Date('2026-10-27T00:00:00.000Z'),
        status: TaskStatus.skipped,
      }),
    ];

    const items = buildWorkoutRecommendations({
      periodFrom,
      periodTo,
      today,
      recentWorkouts: recent,
      weekWorkouts: [...recent, ...future],
      futureWorkouts: future,
      feelings: [{ feeling: Feeling.hard }],
    });

    expect(
      items.every((item) => item.change.kind !== 'simplify_exercise'),
    ).toBe(true);
  });

  it('drops items that would exceed the 15% weekly volume budget', () => {
    const week = [
      workout({
        id: 1,
        taskDate: new Date('2026-10-27T00:00:00.000Z'),
        detailsJson: {
          exercises: [{ name: 'Приседания', sets: 10, reps: 10 }],
        },
      }),
    ];
    const base = workoutVolumeSets(week);
    expect(maxVolumeDeltaSets(base)).toBe(1);

    const oversized = filterItemsByVolume(
      [
        {
          id: 'a',
          title: 'a',
          description: 'a',
          selected: false,
          change: {
            kind: 'sets',
            direction: 'ease',
            taskId: 1,
            volumeDeltaSets: -2,
          },
        },
        {
          id: 'b',
          title: 'b',
          description: 'b',
          selected: false,
          change: {
            kind: 'sets',
            direction: 'ease',
            taskId: 1,
            volumeDeltaSets: -1,
          },
        },
      ],
      base,
    );

    expect(oversized).toHaveLength(1);
    expect(oversized[0].id).toBe('b');
    expect(absoluteVolumeDelta(oversized)).toBeLessThanOrEqual(
      maxVolumeDeltaSets(base),
    );
  });

  it('proposes a slight harden only when compliance is high and feeling is easy', () => {
    const recent = [
      workout({
        id: 1,
        taskDate: new Date('2026-10-26T00:00:00.000Z'),
        status: TaskStatus.done,
      }),
      workout({
        id: 2,
        taskDate: new Date('2026-10-28T00:00:00.000Z'),
        status: TaskStatus.done,
      }),
    ];
    const future = [
      workout({
        id: 10,
        taskDate: new Date('2026-10-31T00:00:00.000Z'),
        detailsJson: {
          exercises: [{ name: 'Приседания', sets: 3, reps: 12 }],
        },
      }),
    ];

    const items = buildWorkoutRecommendations({
      periodFrom,
      periodTo,
      today,
      recentWorkouts: recent,
      weekWorkouts: [...recent, ...future],
      futureWorkouts: future,
      feelings: [{ feeling: Feeling.easy }, { feeling: Feeling.easy }],
    });

    expect(items).toHaveLength(1);
    expect(items[0].change.kind).toBe('sets');
    expect(items[0].change.direction).toBe('harden');
    expect(items[0].change.volumeDeltaSets).toBe(1);
  });
});
