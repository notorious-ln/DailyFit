import { apiRequest } from './client';

export type Feeling = 'easy' | 'normal' | 'hard';

export type DiaryNote = {
  id: number;
  user_id: number;
  note_date: string;
  feeling: Feeling;
  weight_kg: number | null;
  user_comment: string | null;
  advisor_comment: string | null;
};

export type DiaryDayItem = {
  date: string;
  has_note: boolean;
  feeling: Feeling | null;
  weight_kg: number | null;
  user_comment: string | null;
  advisor_comment: string | null;
  day_compliance_percent: number | null;
};

export type DiaryWeek = {
  from: string;
  to: string;
  days: DiaryDayItem[];
  notes_count: number;
  dominant_feeling: Feeling | null;
  last_weight_kg: number | null;
};

export type DiaryUpsert = {
  feeling: Feeling;
  weight_kg?: number | null;
  user_comment?: string | null;
};

export function getDiaryWeek(from?: string, to?: string): Promise<DiaryWeek> {
  const params = new URLSearchParams();
  if (from && to) {
    params.set('from', from);
    params.set('to', to);
  }
  const suffix = params.toString() ? `?${params}` : '';
  return apiRequest<DiaryWeek>(`/diary/week${suffix}`);
}

export function getDiaryDay(date: string): Promise<DiaryDayItem> {
  return apiRequest<DiaryDayItem>(`/diary/${date}`);
}

export function upsertDiary(
  date: string,
  data: DiaryUpsert,
): Promise<DiaryNote> {
  return apiRequest<DiaryNote>(`/diary/${date}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export const FEELING_LABELS: Record<Feeling, string> = {
  easy: 'Легко',
  normal: 'Нормально',
  hard: 'Тяжело',
};
