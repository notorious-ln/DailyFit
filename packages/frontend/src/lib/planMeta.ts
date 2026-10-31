import { parseLevelPlace, type TemplateCard } from '../api/catalog';
import {
  LEVEL_OPTIONS,
  PLACE_OPTIONS,
  type Profile,
  type TrainingPlace,
} from '../api/profile';

export function levelLabel(level: number | null | undefined): string {
  return (
    LEVEL_OPTIONS.find((item) => item.value === level)?.label ?? 'Уровень'
  );
}

export function placeLabel(place: TrainingPlace | null | undefined): string {
  return PLACE_OPTIONS.find((item) => item.value === place)?.label ?? 'Место';
}

export function formatLevelPlace(levelPlace: string): string {
  const parsed = parseLevelPlace(levelPlace);
  return [levelLabel(parsed.level), placeLabel(parsed.place)]
    .filter(Boolean)
    .join(' • ');
}

export function workoutMeta(template: TemplateCard): string {
  const base = formatLevelPlace(template.level_place);
  if (template.days_per_week == null) {
    return base;
  }
  const days = `${template.days_per_week} ${daysWord(template.days_per_week)}`;
  return `${base} • ${days}`;
}

export function mealMeta(
  template: TemplateCard,
  calories?: number | null,
): string {
  const parts: string[] = [];
  if (template.meals_count != null) {
    parts.push(`${template.meals_count} ${mealsWord(template.meals_count)}`);
  }
  if (calories != null) {
    parts.push(`${Math.round(calories).toLocaleString('ru-RU')} ккал`);
  }
  return parts.length > 0 ? parts.join(' • ') : formatLevelPlace(template.level_place);
}

export function activeWorkoutSubtitle(plan: {
  level_place: string;
  body_json?: Record<string, unknown> | null;
}): string {
  const body = plan.body_json ?? {};
  const parsed = parseLevelPlace(plan.level_place);
  const daysPerWeek =
    typeof body.days_per_week === 'number'
      ? body.days_per_week
      : Array.isArray(body.days)
        ? body.days.length
        : null;
  const parts: string[] = [];
  if (daysPerWeek != null) {
    parts.push(
      `${daysPerWeek} ${workoutsWord(daysPerWeek)} в неделю`,
    );
  }
  if (parsed.place) {
    parts.push(parsed.place === 'home' ? 'дома' : 'в зале');
  }
  return parts.join(' • ') || formatLevelPlace(plan.level_place);
}

export function activeMealSubtitle(plan: {
  body_json?: Record<string, unknown> | null;
  daily_calories: number | null;
}): string {
  const body = plan.body_json ?? {};
  const meals = Array.isArray(body.meals) ? body.meals.length : null;
  const parts: string[] = [];
  if (meals != null) {
    parts.push(`${meals} ${mealsWord(meals)}`);
  }
  if (plan.daily_calories != null) {
    parts.push(
      `${Math.round(plan.daily_calories).toLocaleString('ru-RU')} ккал`,
    );
  }
  return parts.join(' • ') || 'План питания';
}

export function templateBadge(
  template: TemplateCard,
  user: Pick<Profile, 'level' | 'place'>,
): { kind: 'fit' | 'above' | 'other'; label: string } {
  const parsed = parseLevelPlace(template.level_place);
  const levelOk =
    user.level == null || parsed.level == null || parsed.level === user.level;
  const placeOk =
    user.place == null || parsed.place == null || parsed.place === user.place;

  if (levelOk && placeOk) {
    return { kind: 'fit', label: 'Подходит вам' };
  }
  if (
    user.level != null &&
    parsed.level != null &&
    parsed.level > user.level
  ) {
    return { kind: 'above', label: 'Выше уровня' };
  }
  return { kind: 'other', label: 'Другой профиль' };
}

function daysWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return 'день';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'дня';
  }
  return 'дней';
}

function mealsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return 'приём';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'приёма';
  }
  return 'приёмов';
}

function workoutsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return 'тренировка';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'тренировки';
  }
  return 'тренировок';
}
