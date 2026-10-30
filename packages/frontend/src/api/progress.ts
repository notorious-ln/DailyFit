import { apiRequest } from './client';

export type ProgressSkip = {
  date: string;
  title: string;
  kind: string;
  status: 'skipped' | 'partial';
};

export type WeightPoint = {
  date: string;
  weight_kg: number;
};

export type DayCompliance = {
  date: string;
  percent: number | null;
};

export type WeekProgress = {
  empty: boolean;
  from: string;
  to: string;
  overall_percent: number | null;
  previous_overall_percent: number | null;
  overall_delta: number | null;
  workout_percent: number | null;
  meal_percent: number | null;
  workout_done: number;
  workout_partial: number;
  workout_total: number;
  current_weight_kg: number | null;
  weight_delta_kg: number | null;
  days: DayCompliance[];
  skips: ProgressSkip[];
  weight_series: WeightPoint[];
};

export function getWeekProgress(
  from?: string,
  to?: string,
): Promise<WeekProgress> {
  const params = new URLSearchParams();
  if (from && to) {
    params.set('from', from);
    params.set('to', to);
  }
  const suffix = params.toString() ? `?${params}` : '';
  return apiRequest<WeekProgress>(`/progress/week${suffix}`);
}
