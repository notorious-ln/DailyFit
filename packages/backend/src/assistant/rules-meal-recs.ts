import { Feeling, TaskStatus } from '@prisma/client';
import { compliancePercent } from '../compliance/compliance.util';
import { addUtcDays, dateKey } from '../day/date.util';
import {
  RecDirection,
  RecommendationItem,
} from './rules-workout-recs';

export const MAX_CALORIE_CHANGE_RATIO = 0.1;
export const MIN_MAINTENANCE_RATIO = 0.8;

export type MealSlot = {
  name?: string;
  examples?: string[];
};

export type MealTaskInput = {
  id: number;
  planId: number;
  title: string;
  taskDate: Date;
  status: TaskStatus | null;
  detailsJson: unknown;
};

/**
 * Food constraints applied only when the tag is explicitly set on the profile.
 * Workout-only tags (колено, спина, …) are ignored here — no guessing.
 */
export const FOOD_TAG_FORBIDDEN: Record<string, string[]> = {
  вегетарианство: [
    'Курица',
    'Индейка',
    'Говядина',
    'Рыба',
    'Рыба на пару',
    'Фарш',
  ],
  без_рыбы: ['Рыба', 'Рыба на пару'],
  без_молочки: [
    'Творог',
    'Творог 5%',
    'Йогурт',
    'Кефир',
    'Сыр',
    'Овсянка на молоке',
    'Омлет',
  ],
  без_орехов: ['Орехи', 'Арахисовая паста'],
};

/** Safer / alternate examples of the same meal role (seed dish names). */
export const DISH_ALTERNATIVES: Record<string, string> = {
  Курица: 'Индейка',
  Индейка: 'Курица',
  Говядина: 'Индейка',
  Рыба: 'Курица',
  'Рыба на пару': 'Индейка',
  Фарш: 'Индейка',
  Творог: 'Яйца',
  'Творог 5%': 'Яйца',
  Йогурт: 'Фрукт',
  Кефир: 'Яблоко',
  Сыр: 'Овощи',
  'Овсянка на молоке': 'Овсянка',
  Омлет: 'Овсянка',
  Орехи: 'Яблоко',
  'Арахисовая паста': 'Банан',
  Паста: 'Гречка',
  Протеин: 'Творог',
};

export type BuildMealRecsInput = {
  periodFrom: Date;
  periodTo: Date;
  today: Date;
  recentMeals: MealTaskInput[];
  futureMeals: MealTaskInput[];
  dailyCalories: number | null;
  maintenanceCalories: number | null;
  limitationTags: string[];
  feelings: Array<{ feeling: Feeling }>;
};

export function extractMeals(detailsJson: unknown): MealSlot[] {
  if (detailsJson == null || typeof detailsJson !== 'object') {
    return [];
  }
  const meals = (detailsJson as { meals?: unknown }).meals;
  if (!Array.isArray(meals)) {
    return [];
  }
  return meals.filter(
    (item): item is MealSlot =>
      item != null && typeof item === 'object' && !Array.isArray(item),
  );
}

export function extractDailyCalories(detailsJson: unknown): number | null {
  if (detailsJson == null || typeof detailsJson !== 'object') {
    return null;
  }
  const value = (detailsJson as { daily_calories?: unknown }).daily_calories;
  return typeof value === 'number' && value > 0 ? value : null;
}

export function foodTagsFrom(limitationTags: string[]): string[] {
  return limitationTags.filter((tag) => FOOD_TAG_FORBIDDEN[tag] != null);
}

export function isDishForbidden(
  dish: string,
  limitationTags: string[],
): boolean {
  for (const tag of foodTagsFrom(limitationTags)) {
    const forbidden = FOOD_TAG_FORBIDDEN[tag] ?? [];
    if (forbidden.some((name) => namesMatch(name, dish))) {
      return true;
    }
  }
  return false;
}

export function maxCalorieDelta(currentCalories: number): number {
  if (currentCalories <= 0) {
    return 0;
  }
  return Math.floor(currentCalories * MAX_CALORIE_CHANGE_RATIO);
}

export function minCaloriesFloor(maintenanceCalories: number | null): number | null {
  if (maintenanceCalories == null || maintenanceCalories <= 0) {
    return null;
  }
  return Math.round(maintenanceCalories * MIN_MAINTENANCE_RATIO);
}

export function absoluteCalorieDelta(items: RecommendationItem[]): number {
  return items.reduce((sum, item) => {
    if (item.change.kind !== 'shift_calories') {
      return sum;
    }
    return sum + Math.abs(item.change.calorieDelta ?? 0);
  }, 0);
}

export function fitsCalorieBudget(
  items: RecommendationItem[],
  currentCalories: number,
): boolean {
  return absoluteCalorieDelta(items) <= maxCalorieDelta(currentCalories);
}

export function buildMealRecommendations(
  input: BuildMealRecsInput,
): RecommendationItem[] {
  const currentCalories =
    input.dailyCalories ??
    input.futureMeals
      .map((task) => extractDailyCalories(task.detailsJson))
      .find((value): value is number => value != null) ??
    null;

  const editable = input.futureMeals.filter(
    (task) =>
      task.taskDate.getTime() >= input.today.getTime() && task.status == null,
  );
  if (editable.length === 0) {
    return [];
  }

  const anchor = editable[0];
  const candidates: RecommendationItem[] = [];
  let seq = 0;
  const nextId = () => {
    seq += 1;
    return `meal-rec-${seq}`;
  };

  const tagReplace = buildTagDrivenReplacements(
    anchor,
    input.limitationTags,
    nextId,
  );
  candidates.push(...tagReplace);

  const windowStart = addUtcDays(input.periodTo, -6);
  const recentInWindow = input.recentMeals.filter(
    (task) =>
      task.taskDate.getTime() >= windowStart.getTime() &&
      task.taskDate.getTime() <= input.periodTo.getTime(),
  );
  const mealPercent = compliancePercent(recentInWindow);
  const mealSkipCount = recentInWindow.filter(
    (task) => task.status === TaskStatus.skipped,
  ).length;
  const direction = resolveMealDirection({
    mealPercent,
    mealSkipCount,
    feelings: input.feelings,
    hasPartial: recentInWindow.some(
      (task) => task.status === TaskStatus.partial,
    ),
  });

  if (direction === 'ease') {
    const reason = reasonForMealEase(mealPercent, mealSkipCount);
    if (currentCalories != null) {
      const calorieItem = buildCalorieShift(
        anchor,
        currentCalories,
        -1,
        'ease',
        reason,
        input.maintenanceCalories,
        nextId,
      );
      if (calorieItem) {
        candidates.push(calorieItem);
      }
    }

    const replaceItem = buildVarietyReplacement(
      anchor,
      input.limitationTags,
      reason,
      nextId,
    );
    if (replaceItem) {
      candidates.push(replaceItem);
    }
  } else if (direction === 'harden' && currentCalories != null) {
    const calorieItem = buildCalorieShift(
      anchor,
      currentCalories,
      1,
      'harden',
      'Сводка по питанию высокая, самочувствие в основном лёгкое.',
      input.maintenanceCalories,
      nextId,
    );
    if (calorieItem) {
      candidates.push(calorieItem);
    }
  }

  if (currentCalories == null) {
    return candidates.filter((item) => item.change.kind !== 'shift_calories');
  }

  return filterItemsByCalorieBudget(candidates, currentCalories);
}

export function filterItemsByCalorieBudget(
  items: RecommendationItem[],
  currentCalories: number,
): RecommendationItem[] {
  const budget = maxCalorieDelta(currentCalories);
  const kept: RecommendationItem[] = [];
  let used = 0;

  for (const item of items) {
    if (item.change.kind !== 'shift_calories') {
      kept.push(item);
      continue;
    }
    const cost = Math.abs(item.change.calorieDelta ?? 0);
    if (used + cost > budget) {
      continue;
    }
    kept.push(item);
    used += cost;
  }

  return kept;
}

function resolveMealDirection(input: {
  mealPercent: number | null;
  mealSkipCount: number;
  feelings: Array<{ feeling: Feeling }>;
  hasPartial: boolean;
}): RecDirection | null {
  if (
    (input.mealPercent != null && input.mealPercent < 50) ||
    input.mealSkipCount >= 2 ||
    input.hasPartial ||
    input.feelings.some((item) => item.feeling === Feeling.hard)
  ) {
    return 'ease';
  }

  const easyCount = input.feelings.filter(
    (item) => item.feeling === Feeling.easy,
  ).length;
  const mostlyEasy =
    input.feelings.length > 0 && easyCount > input.feelings.length / 2;

  if (
    input.mealPercent != null &&
    input.mealPercent >= 90 &&
    mostlyEasy
  ) {
    return 'harden';
  }

  return null;
}

function reasonForMealEase(
  mealPercent: number | null,
  mealSkipCount: number,
): string {
  if (mealSkipCount >= 2) {
    return `За семь дней пропущено приёмов пищи / дней питания: ${mealSkipCount}.`;
  }
  if (mealPercent != null && mealPercent < 50) {
    return `Сводка по питанию ${mealPercent}% — ниже 50%.`;
  }
  return 'Самочувствие или частичные отметки указывают на перегруз.';
}

function buildCalorieShift(
  task: MealTaskInput,
  currentCalories: number,
  sign: -1 | 1,
  direction: RecDirection,
  reason: string,
  maintenanceCalories: number | null,
  nextId: () => string,
): RecommendationItem | null {
  const maxStep = maxCalorieDelta(currentCalories);
  if (maxStep < 1) {
    return null;
  }

  let target = currentCalories + sign * maxStep;
  let clipped = false;
  const floor = minCaloriesFloor(maintenanceCalories);

  if (sign < 0 && floor != null && target < floor) {
    if (currentCalories <= floor) {
      return null;
    }
    target = floor;
    clipped = true;
  }

  const calorieDelta = target - currentCalories;
  if (calorieDelta === 0) {
    return null;
  }

  const changeLabel =
    calorieDelta < 0
      ? `снизить суточную калорийность с ${currentCalories} до ${target} ккал`
      : `поднять суточную калорийность с ${currentCalories} до ${target} ккал`;

  const reasonParts = [reason];
  if (clipped && floor != null) {
    reasonParts.push(
      `Шаг обрезан до ${floor} ккал (не ниже 80% от рассчитанного поддержания ${maintenanceCalories} ккал).`,
    );
  }

  return {
    id: nextId(),
    title: `Питание: ${calorieDelta < 0 ? 'меньше калорий' : 'чуть больше калорий'}`,
    description: [
      `Задача: «${task.title}» (${dateKey(task.taskDate)}).`,
      `Изменение: ${changeLabel}.`,
      `Причина: ${reasonParts.join(' ')}`,
    ].join(' '),
    selected: false,
    change: {
      kind: 'shift_calories',
      direction,
      taskId: task.id,
      planId: task.planId,
      fromCalories: currentCalories,
      toCalories: target,
      calorieDelta,
      clippedToFloor: clipped,
      volumeDeltaSets: 0,
    },
  };
}

function buildTagDrivenReplacements(
  task: MealTaskInput,
  limitationTags: string[],
  nextId: () => string,
): RecommendationItem[] {
  const tags = foodTagsFrom(limitationTags);
  if (tags.length === 0) {
    return [];
  }

  const meals = extractMeals(task.detailsJson);
  const items: RecommendationItem[] = [];

  for (let mealIndex = 0; mealIndex < meals.length; mealIndex += 1) {
    const slot = meals[mealIndex];
    const examples = Array.isArray(slot.examples) ? slot.examples : [];
    for (let exampleIndex = 0; exampleIndex < examples.length; exampleIndex += 1) {
      const fromExample = examples[exampleIndex];
      if (typeof fromExample !== 'string' || !isDishForbidden(fromExample, tags)) {
        continue;
      }
      const toExample = pickAlternative(fromExample, limitationTags);
      if (!toExample) {
        continue;
      }
      const mealName = slot.name ?? `приём ${mealIndex + 1}`;
      items.push({
        id: nextId(),
        title: `${mealName}: заменить пример блюда`,
        description: [
          `Задача: «${task.title}» (${dateKey(task.taskDate)}).`,
          `Изменение: заменить пример «${fromExample}» на «${toExample}» в «${mealName}».`,
          `Причина: метка ограничения (${tags.join(', ')}) запрещает «${fromExample}».`,
        ].join(' '),
        selected: false,
        change: {
          kind: 'replace_dish',
          direction: 'neutral',
          taskId: task.id,
          planId: task.planId,
          mealIndex,
          exampleIndex,
          fromExample,
          toExample,
          volumeDeltaSets: 0,
        },
      });
      if (items.length >= 2) {
        return items;
      }
    }
  }

  return items;
}

function buildVarietyReplacement(
  task: MealTaskInput,
  limitationTags: string[],
  reason: string,
  nextId: () => string,
): RecommendationItem | null {
  const meals = extractMeals(task.detailsJson);
  for (let mealIndex = 0; mealIndex < meals.length; mealIndex += 1) {
    const slot = meals[mealIndex];
    const examples = Array.isArray(slot.examples) ? slot.examples : [];
    for (let exampleIndex = 0; exampleIndex < examples.length; exampleIndex += 1) {
      const fromExample = examples[exampleIndex];
      if (typeof fromExample !== 'string') {
        continue;
      }
      if (isDishForbidden(fromExample, limitationTags)) {
        continue;
      }
      const toExample = pickAlternative(fromExample, limitationTags);
      if (!toExample || toExample === fromExample) {
        continue;
      }
      const mealName = slot.name ?? `приём ${mealIndex + 1}`;
      return {
        id: nextId(),
        title: `${mealName}: заменить пример блюда`,
        description: [
          `Задача: «${task.title}» (${dateKey(task.taskDate)}).`,
          `Изменение: заменить пример «${fromExample}» на «${toExample}» в «${mealName}».`,
          `Причина: ${reason}`,
        ].join(' '),
        selected: false,
        change: {
          kind: 'replace_dish',
          direction: 'ease',
          taskId: task.id,
          planId: task.planId,
          mealIndex,
          exampleIndex,
          fromExample,
          toExample,
          volumeDeltaSets: 0,
        },
      };
    }
  }
  return null;
}

function pickAlternative(
  fromExample: string,
  limitationTags: string[],
): string | null {
  const direct = DISH_ALTERNATIVES[fromExample];
  if (direct && !isDishForbidden(direct, limitationTags)) {
    return direct;
  }

  const fallbacks = [
    'Овощи',
    'Гречка',
    'Рис',
    'Салат',
    'Яблоко',
    'Фрукт',
    'Яйца',
    'Овсянка',
  ];
  return (
    fallbacks.find((dish) => !isDishForbidden(dish, limitationTags)) ?? null
  );
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru');
}
