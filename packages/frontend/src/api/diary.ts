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

export type DiaryUpsert = {
  feeling: Feeling;
  weight_kg?: number | null;
  user_comment?: string | null;
};

export function upsertDiary(
  date: string,
  data: DiaryUpsert,
): Promise<DiaryNote> {
  return apiRequest<DiaryNote>(`/diary/${date}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
