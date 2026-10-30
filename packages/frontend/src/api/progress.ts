import { apiRequest } from './client';

export type WeekProgress = {
  empty: boolean;
  workout_percent: number | null;
  meal_percent: number | null;
  skips: Array<{ date: string; title: string; kind: string }>;
  weight_series: Array<{ date: string; weight_kg: number }>;
};

export function getWeekProgress(from: string, to: string): Promise<WeekProgress> {
  const params = new URLSearchParams({ from, to });
  return apiRequest<WeekProgress>(`/progress/week?${params}`);
}
