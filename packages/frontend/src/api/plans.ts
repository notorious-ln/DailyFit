import { apiRequest } from './client';
import type { TemplateType } from './catalog';

export type ActivePlan = {
  id: number;
  user_id: number;
  template_id: number;
  type: TemplateType;
  title: string;
  level_place: string;
  body_json: Record<string, unknown>;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
  daily_calories: number | null;
};

export type CaloriePreview = {
  suggested_calories: number | null;
  needs_manual_input: boolean;
  message: string;
};

export function listActivePlans(): Promise<ActivePlan[]> {
  return apiRequest<ActivePlan[]>('/plans/active');
}

export function activateWorkout(
  templateId: number,
  confirmReplace = false,
): Promise<ActivePlan> {
  return apiRequest<ActivePlan>('/activate-workout', {
    method: 'POST',
    body: JSON.stringify({
      templateId,
      ...(confirmReplace ? { confirmReplace: true } : {}),
    }),
  });
}

export function previewMealCalories(
  templateId: number,
): Promise<CaloriePreview> {
  return apiRequest<CaloriePreview>('/activate-meal', {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  });
}

export function activateMeal(
  templateId: number,
  dailyCalories?: number | null,
): Promise<ActivePlan> {
  return apiRequest<ActivePlan>('/activate-meal', {
    method: 'POST',
    body: JSON.stringify({
      templateId,
      confirm: true,
      ...(dailyCalories != null ? { daily_calories: dailyCalories } : {}),
    }),
  });
}
