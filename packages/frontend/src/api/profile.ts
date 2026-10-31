import { apiRequest } from './client';

export type TrainingPlace = 'home' | 'gym';
export type Gender = 'male' | 'female' | 'other';

export type Profile = {
  id: number;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  goal: number | null;
  level: number | null;
  place: TrainingPlace | null;
  workouts_per_week: number | null;
  gender: Gender | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  limitation_tags: string[];
  free_note: string | null;
  cloud_assistant_enabled: boolean;
};

export type ProfileUpdate = {
  display_name?: string | null;
  goal: number;
  level: number;
  place?: TrainingPlace;
  workouts_per_week?: number;
  gender?: Gender | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  limitation_tags?: string[];
  free_note?: string | null;
  cloud_assistant_enabled?: boolean;
};

export function getProfile(): Promise<Profile> {
  return apiRequest<Profile>('/profile');
}

export function updateProfile(data: ProfileUpdate): Promise<Profile> {
  return apiRequest<Profile>('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export const GOAL_OPTIONS = [
  { value: 1, label: 'Снизить вес' },
  { value: 2, label: 'Удержать вес' },
  { value: 3, label: 'Набрать массу' },
  { value: 4, label: 'Выработать привычку' },
] as const;

export const LEVEL_OPTIONS = [
  { value: 1, label: 'Новичок' },
  { value: 2, label: 'Уверенный' },
] as const;

export const PLACE_OPTIONS = [
  { value: 'home' as const, label: 'Дом' },
  { value: 'gym' as const, label: 'Зал' },
];

export const LIMITATION_OPTIONS = [
  'Без прыжков',
  'Без осевой нагрузки',
  'Без оборудования',
] as const;
