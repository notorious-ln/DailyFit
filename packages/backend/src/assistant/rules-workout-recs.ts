import { Feeling, TaskStatus } from '@prisma/client';
import { compliancePercent } from '../compliance/compliance.util';
import { addUtcDays, dateKey, startOfIsoWeek } from '../day/date.util';

export const MAX_VOLUME_CHANGE_RATIO = 0.15;

export type RecDirection = 'ease' | 'harden' | 'neutral';

export type RecChangeKind =
  | 'sets'
  | 'simplify_exercise'
  | 'reschedule'
  | 'replace_dish'
  | 'shift_calories';

export type ExerciseShape = {
  name?: string;
  sets?: number;
  reps?: number;
  duration_sec?: number;
};

export type WorkoutTaskInput = {
  id: number;
  planId: number;
  title: string;
  taskDate: Date;
  status: TaskStatus | null;
  detailsJson: unknown;
};

export type RecommendationChange = {
  kind: RecChangeKind;
  direction: RecDirection;
  taskId: number;
  planId?: number;
  exerciseIndex?: number;
  fromSets?: number;
  toSets?: number;
  fromName?: string;
  toName?: string;
  fromDate?: string;
  toDate?: string;
  volumeDeltaSets: number;
  mealIndex?: number;
  exampleIndex?: number;
  fromExample?: string;
  toExample?: string;
  fromCalories?: number;
  toCalories?: number;
  calorieDelta?: number;
  clippedToFloor?: boolean;
};

export type RecommendationItem = {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  change: RecommendationChange;
};

export type BuildWorkoutRecsInput = {
  periodFrom: Date;
  periodTo: Date;
  today: Date;
  recentWorkouts: WorkoutTaskInput[];
  /** Workout tasks spanning the last three ISO weeks ending at `periodTo`. */
  historyWorkouts: WorkoutTaskInput[];
  weekWorkouts: WorkoutTaskInput[];
  futureWorkouts: WorkoutTaskInput[];
  feelings: Array<{ feeling: Feeling }>;
};

/** Simpler variants of the same movement character (seed exercise names). */
export const SIMPLER_EXERCISE: Record<string, string> = {
  'Отжимания с паузой': 'Отжимания',
  'Болгарские выпады': 'Выпады',
  Бёрпи: 'Марш на месте',
  'Приседания + жим руками': 'Приседания',
  'Жим гантелей': 'Разведение гантелей',
  'Жим над головой': 'Подъём рук в стороны',
  'Тяга штанги': 'Тяга в наклоне (бутылки)',
  'Подтягивания / тяга': 'Тяга верхнего блока',
  Присед: 'Приседания',
  'Румынская тяга': 'Ягодичный мост',
  'Боковая планка': 'Планка',
};

export function extractExercises(detailsJson: unknown): ExerciseShape[] {
  if (detailsJson == null || typeof detailsJson !== 'object') {
    return [];
  }
  const exercises = (detailsJson as { exercises?: unknown }).exercises;
  if (!Array.isArray(exercises)) {
    return [];
  }
  return exercises.filter(
    (item): item is ExerciseShape =>
      item != null && typeof item === 'object' && !Array.isArray(item),
  );
}

export function workoutVolumeSets(tasks: WorkoutTaskInput[]): number {
  return tasks.reduce((sum, task) => {
    return (
      sum +
      extractExercises(task.detailsJson).reduce(
        (inner, exercise) =>
          inner + (typeof exercise.sets === 'number' ? exercise.sets : 0),
        0,
      )
    );
  }, 0);
}

export function maxVolumeDeltaSets(baseVolume: number): number {
  if (baseVolume <= 0) {
    return 0;
  }
  return Math.floor(baseVolume * MAX_VOLUME_CHANGE_RATIO);
}

export function absoluteVolumeDelta(items: RecommendationItem[]): number {
  return items.reduce(
    (sum, item) => sum + Math.abs(item.change.volumeDeltaSets),
    0,
  );
}

export function fitsVolumeBudget(
  items: RecommendationItem[],
  baseVolume: number,
): boolean {
  return absoluteVolumeDelta(items) <= maxVolumeDeltaSets(baseVolume);
}

export function filterItemsByVolume(
  items: RecommendationItem[],
  baseVolume: number,
): RecommendationItem[] {
  const budget = maxVolumeDeltaSets(baseVolume);
  const kept: RecommendationItem[] = [];
  let used = 0;

  for (const item of items) {
    const cost = Math.abs(item.change.volumeDeltaSets);
    if (used + cost > budget) {
      continue;
    }
    kept.push(item);
    used += cost;
  }

  return kept;
}

export function buildWorkoutRecommendations(
  input: BuildWorkoutRecsInput,
): RecommendationItem[] {
  const windowStart = addUtcDays(input.periodTo, -6);
  const recentInWindow = input.recentWorkouts.filter(
    (task) =>
      task.taskDate.getTime() >= windowStart.getTime() &&
      task.taskDate.getTime() <= input.periodTo.getTime(),
  );
  const workoutSkipCount = recentInWindow.filter(
    (task) => task.status === TaskStatus.skipped,
  ).length;
  const workoutPercent = compliancePercent(recentInWindow);
  const hardenBlocked = workoutSkipCount >= 2;
  const threeWeeksAbove90 = consecutiveWeeksAbove(
    input.historyWorkouts,
    input.periodTo,
    3,
    90,
  );

  const direction = resolveDirection({
    workoutPercent,
    workoutSkipCount,
    hardenBlocked,
    threeWeeksAbove90,
    feelings: input.feelings,
    hasPartial: recentInWindow.some(
      (task) => task.status === TaskStatus.partial,
    ),
    hasHardFeeling: input.feelings.some(
      (item) => item.feeling === Feeling.hard,
    ),
  });

  if (direction == null) {
    return [];
  }

  const editable = input.futureWorkouts.filter(
    (task) =>
      task.taskDate.getTime() >= input.today.getTime() && task.status == null,
  );
  if (editable.length === 0) {
    return [];
  }

  const occupiedDates = new Set(
    [...input.weekWorkouts, ...input.futureWorkouts].map((task) =>
      dateKey(task.taskDate),
    ),
  );

  const candidates: RecommendationItem[] = [];
  let seq = 0;
  const easeReason = reasonForEase(workoutPercent, workoutSkipCount);
  const hardenReason =
    'Три недели подряд сводка по тренировкам выше 90%, самочувствие отмечено как «легко».';

  if (direction === 'ease') {
    for (const task of editable) {
      const setsItem = buildSetsChange(task, -1, 'ease', easeReason, () => {
        seq += 1;
        return `rec-${seq}`;
      });
      if (setsItem) {
        candidates.push(setsItem);
      }

      const simplifyItem = buildSimplifyChange(task, easeReason, () => {
        seq += 1;
        return `rec-${seq}`;
      });
      if (simplifyItem) {
        candidates.push(simplifyItem);
      }

      const rescheduleItem = buildRescheduleChange(
        task,
        occupiedDates,
        easeReason,
        () => {
          seq += 1;
          return `rec-${seq}`;
        },
      );
      if (rescheduleItem) {
        candidates.push(rescheduleItem);
      }

      if (candidates.length >= 3) {
        break;
      }
    }
  } else if (direction === 'harden' && !hardenBlocked) {
    for (const task of editable) {
      const setsItem = buildSetsChange(task, 1, 'harden', hardenReason, () => {
        seq += 1;
        return `rec-${seq}`;
      });
      if (setsItem) {
        candidates.push(setsItem);
        break;
      }
    }
  }

  const baseVolume = workoutVolumeSets(input.weekWorkouts);
  return filterItemsByVolume(candidates, baseVolume);
}

/** Last `weekCount` ISO weeks ending at the week of `periodTo`, oldest first. */
export function consecutiveWeeksAbove(
  workouts: WorkoutTaskInput[],
  periodTo: Date,
  weekCount: number,
  threshold: number,
): boolean {
  const currentWeekStart = startOfIsoWeek(periodTo);
  for (let back = weekCount - 1; back >= 0; back -= 1) {
    const from = addUtcDays(currentWeekStart, -7 * back);
    const to = addUtcDays(from, 6);
    const inWeek = workouts.filter(
      (task) =>
        task.taskDate.getTime() >= from.getTime() &&
        task.taskDate.getTime() <= to.getTime(),
    );
    const percent = compliancePercent(inWeek);
    if (percent == null || percent <= threshold) {
      return false;
    }
  }
  return true;
}

function resolveDirection(input: {
  workoutPercent: number | null;
  workoutSkipCount: number;
  hardenBlocked: boolean;
  threeWeeksAbove90: boolean;
  feelings: Array<{ feeling: Feeling }>;
  hasPartial: boolean;
  hasHardFeeling: boolean;
}): RecDirection | null {
  // FT-14: ниже 50% за семь дней и не менее двух пропусков — облегчить.
  if (
    input.workoutPercent != null &&
    input.workoutPercent < 50 &&
    input.workoutSkipCount >= 2
  ) {
    return 'ease';
  }

  if (input.hasHardFeeling || input.hasPartial) {
    return 'ease';
  }

  const easyCount = input.feelings.filter(
    (item) => item.feeling === Feeling.easy,
  ).length;
  const markedEasy =
    input.feelings.length > 0 && easyCount === input.feelings.length;

  // FT-14: три недели подряд выше 90% и самочувствие «легко» — усложнить.
  if (!input.hardenBlocked && input.threeWeeksAbove90 && markedEasy) {
    return 'harden';
  }

  return null;
}

function reasonForEase(
  workoutPercent: number | null,
  workoutSkipCount: number,
): string {
  if (
    workoutPercent != null &&
    workoutPercent < 50 &&
    workoutSkipCount >= 2
  ) {
    return `Сводка по тренировкам за семь дней ${workoutPercent}% (ниже 50%), пропусков: ${workoutSkipCount}.`;
  }
  return 'Самочувствие или частичные отметки указывают на перегруз.';
}

function buildSetsChange(
  task: WorkoutTaskInput,
  delta: number,
  direction: RecDirection,
  reason: string,
  nextId: () => string,
): RecommendationItem | null {
  const exercises = extractExercises(task.detailsJson);
  const index = exercises.findIndex((exercise) => {
    if (typeof exercise.sets !== 'number') {
      return false;
    }
    if (delta < 0) {
      return exercise.sets + delta >= 1;
    }
    return true;
  });
  if (index < 0) {
    return null;
  }

  const exercise = exercises[index];
  const fromSets = exercise.sets as number;
  const toSets = fromSets + delta;
  const name = exercise.name ?? `упражнение ${index + 1}`;
  const changeLabel =
    delta < 0
      ? `уменьшить подходы «${name}» с ${fromSets} до ${toSets}`
      : `немного увеличить подходы «${name}» с ${fromSets} до ${toSets}`;

  return {
    id: nextId(),
    title: `${task.title}: ${delta < 0 ? 'меньше подходов' : 'чуть больше подходов'}`,
    description: [
      `Задача: «${task.title}» (${dateKey(task.taskDate)}).`,
      `Изменение: ${changeLabel}.`,
      `Причина: ${reason}`,
    ].join(' '),
    selected: false,
    change: {
      kind: 'sets',
      direction,
      taskId: task.id,
      exerciseIndex: index,
      fromSets,
      toSets,
      volumeDeltaSets: delta,
    },
  };
}

function buildSimplifyChange(
  task: WorkoutTaskInput,
  reason: string,
  nextId: () => string,
): RecommendationItem | null {
  const exercises = extractExercises(task.detailsJson);
  const index = exercises.findIndex(
    (exercise) =>
      typeof exercise.name === 'string' &&
      SIMPLER_EXERCISE[exercise.name] != null,
  );
  if (index < 0) {
    return null;
  }

  const exercise = exercises[index];
  const fromName = exercise.name as string;
  const toName = SIMPLER_EXERCISE[fromName];

  return {
    id: nextId(),
    title: `${task.title}: проще упражнение`,
    description: [
      `Задача: «${task.title}» (${dateKey(task.taskDate)}).`,
      `Изменение: заменить «${fromName}» на более простой вариант «${toName}».`,
      `Причина: ${reason}`,
    ].join(' '),
    selected: false,
    change: {
      kind: 'simplify_exercise',
      direction: 'ease',
      taskId: task.id,
      exerciseIndex: index,
      fromName,
      toName,
      volumeDeltaSets: 0,
    },
  };
}

function buildRescheduleChange(
  task: WorkoutTaskInput,
  occupiedDates: Set<string>,
  reason: string,
  nextId: () => string,
): RecommendationItem | null {
  const weekStart = startOfIsoWeek(task.taskDate);
  const fromKey = dateKey(task.taskDate);

  for (let offset = 1; offset <= 6; offset += 1) {
    const candidate = addUtcDays(task.taskDate, offset);
    if (candidate.getTime() > addUtcDays(weekStart, 6).getTime()) {
      break;
    }
    const key = dateKey(candidate);
    if (occupiedDates.has(key)) {
      continue;
    }
    occupiedDates.add(key);
    occupiedDates.delete(fromKey);

    return {
      id: nextId(),
      title: `${task.title}: перенос на другой день`,
      description: [
        `Задача: «${task.title}» (${fromKey}).`,
        `Изменение: перенести тренировку на ${key}.`,
        `Причина: ${reason}`,
      ].join(' '),
      selected: false,
      change: {
        kind: 'reschedule',
        direction: 'neutral',
        taskId: task.id,
        fromDate: fromKey,
        toDate: key,
        volumeDeltaSets: 0,
      },
    };
  }

  return null;
}
