import { Feeling, TaskStatus } from '@prisma/client';
import {
  MealTaskInput,
  buildMealRecommendations,
  fitsCalorieBudget,
  maxCalorieDelta,
  minCaloriesFloor,
} from './rules-meal-recs';

function meal(
  partial: Partial<MealTaskInput> & { id: number; taskDate: Date },
): MealTaskInput {
  return {
    planId: 5,
    title: partial.title ?? `Питание ${partial.id}`,
    status: partial.status ?? null,
    detailsJson: partial.detailsJson ?? {
      daily_calories: 2000,
      meals: [
        { name: 'Завтрак', examples: ['Овсянка', 'Яйца'] },
        { name: 'Обед', examples: ['Курица', 'Крупа', 'Овощи'] },
        { name: 'Ужин', examples: ['Рыба', 'Салат'] },
      ],
    },
    ...partial,
  };
}

describe('rules-meal-recs', () => {
  const today = new Date('2026-10-30T00:00:00.000Z');
  const periodTo = today;
  const periodFrom = new Date('2026-10-24T00:00:00.000Z');

  it('builds ease calorie and dish items with task, change and reason', () => {
    const recent = [
      meal({
        id: 1,
        taskDate: new Date('2026-10-24T00:00:00.000Z'),
        status: TaskStatus.skipped,
      }),
      meal({
        id: 2,
        taskDate: new Date('2026-10-26T00:00:00.000Z'),
        status: TaskStatus.skipped,
      }),
    ];
    const future = [
      meal({
        id: 10,
        taskDate: new Date('2026-10-31T00:00:00.000Z'),
        title: 'Питание: план',
      }),
    ];

    const items = buildMealRecommendations({
      periodFrom,
      periodTo,
      today,
      recentMeals: recent,
      futureMeals: future,
      dailyCalories: 2000,
      maintenanceCalories: 2200,
      limitationTags: ['колено'],
      feelings: [{ feeling: Feeling.hard }],
    });

    expect(items.length).toBeGreaterThan(0);
    expect(
      items.some((item) => item.change.kind === 'shift_calories'),
    ).toBe(true);
    for (const item of items) {
      expect(item.description).toContain('Задача:');
      expect(item.description).toContain('Изменение:');
      expect(item.description).toContain('Причина:');
    }
    const shift = items.find((item) => item.change.kind === 'shift_calories');
    expect(shift?.change.calorieDelta).toBeLessThan(0);
    expect(
      Math.abs(shift?.change.calorieDelta ?? 0),
    ).toBeLessThanOrEqual(maxCalorieDelta(2000));
  });

  it('clips calorie drop to 80% of maintenance and states it in the reason', () => {
    const future = [
      meal({
        id: 10,
        taskDate: new Date('2026-10-31T00:00:00.000Z'),
        title: 'Питание: план',
      }),
    ];
    const recent = [
      meal({
        id: 1,
        taskDate: new Date('2026-10-25T00:00:00.000Z'),
        status: TaskStatus.skipped,
      }),
      meal({
        id: 2,
        taskDate: new Date('2026-10-27T00:00:00.000Z'),
        status: TaskStatus.skipped,
      }),
    ];

    const maintenance = 2000;
    const floor = minCaloriesFloor(maintenance) as number;
    const current = Math.round(floor / 0.92);

    const items = buildMealRecommendations({
      periodFrom,
      periodTo,
      today,
      recentMeals: recent,
      futureMeals: future,
      dailyCalories: current,
      maintenanceCalories: maintenance,
      limitationTags: [],
      feelings: [{ feeling: Feeling.hard }],
    });

    const shift = items.find((item) => item.change.kind === 'shift_calories');
    expect(shift).toBeDefined();
    expect(shift?.change.toCalories).toBe(floor);
    expect(shift?.change.clippedToFloor).toBe(true);
    expect(shift?.description).toMatch(/обрезан|80%/);
  });

  it('replaces dishes only for explicit food tags, not workout tags', () => {
    const future = [
      meal({
        id: 10,
        taskDate: new Date('2026-10-31T00:00:00.000Z'),
        title: 'Питание: план',
      }),
    ];

    const withoutFoodTag = buildMealRecommendations({
      periodFrom,
      periodTo,
      today,
      recentMeals: [],
      futureMeals: future,
      dailyCalories: 2000,
      maintenanceCalories: 2200,
      limitationTags: ['колено', 'спина'],
      feelings: [{ feeling: Feeling.normal }],
    });
    expect(
      withoutFoodTag.every((item) => item.change.kind !== 'replace_dish'),
    ).toBe(true);

    const withFoodTag = buildMealRecommendations({
      periodFrom,
      periodTo,
      today,
      recentMeals: [],
      futureMeals: future,
      dailyCalories: 2000,
      maintenanceCalories: 2200,
      limitationTags: ['вегетарианство'],
      feelings: [{ feeling: Feeling.normal }],
    });
    const replaces = withFoodTag.filter(
      (item) => item.change.kind === 'replace_dish',
    );
    expect(replaces.length).toBeGreaterThan(0);
    expect(replaces[0].change.fromExample).toMatch(/Курица|Рыба/);
    expect(replaces[0].description).toContain('метка ограничения');
  });

  it('keeps accepted calorie shift within 10%', () => {
    expect(fitsCalorieBudget([], 2000)).toBe(true);
    expect(
      fitsCalorieBudget(
        [
          {
            id: '1',
            title: 't',
            description: 'd',
            selected: false,
            change: {
              kind: 'shift_calories',
              direction: 'ease',
              taskId: 1,
              calorieDelta: -200,
              volumeDeltaSets: 0,
            },
          },
        ],
        2000,
      ),
    ).toBe(true);
    expect(
      fitsCalorieBudget(
        [
          {
            id: '1',
            title: 't',
            description: 'd',
            selected: false,
            change: {
              kind: 'shift_calories',
              direction: 'ease',
              taskId: 1,
              calorieDelta: -201,
              volumeDeltaSets: 0,
            },
          },
        ],
        2000,
      ),
    ).toBe(false);
  });
});
