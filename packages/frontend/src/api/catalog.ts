import { apiRequest } from './client';
import type { TrainingPlace } from './profile';

export type TemplateType = 'workout' | 'meal';

export type TemplateCard = {
  id: number;
  type: TemplateType;
  title: string;
  level_place: string;
  is_visible: boolean;
  description: string | null;
  days_per_week: number | null;
  meals_count: number | null;
};

export type TemplateDetails = TemplateCard & {
  body_json: Record<string, unknown>;
};

export type TemplateListResponse = {
  items: TemplateCard[];
  hint: string | null;
};

export type ListTemplatesQuery = {
  type?: TemplateType;
  level?: number;
  place?: TrainingPlace;
  any_level?: boolean;
  any_place?: boolean;
};

export function listTemplates(
  query: ListTemplatesQuery = {},
): Promise<TemplateListResponse> {
  const params = new URLSearchParams();
  if (query.type) {
    params.set('type', query.type);
  }
  if (query.level != null) {
    params.set('level', String(query.level));
  }
  if (query.place) {
    params.set('place', query.place);
  }
  if (query.any_level) {
    params.set('any_level', 'true');
  }
  if (query.any_place) {
    params.set('any_place', 'true');
  }
  const suffix = params.toString() ? `?${params}` : '';
  return apiRequest<TemplateListResponse>(`/templates${suffix}`);
}

export function getTemplate(id: number): Promise<TemplateDetails> {
  return apiRequest<TemplateDetails>(`/templates/${id}`);
}

export function parseLevelPlace(levelPlace: string): {
  level: number | null;
  place: TrainingPlace | null;
} {
  const [rawLevel, rawPlace] = levelPlace.split('/');
  const level = Number.parseInt(rawLevel ?? '', 10);
  const place =
    rawPlace === 'home' || rawPlace === 'gym'
      ? rawPlace
      : null;
  return {
    level: Number.isFinite(level) ? level : null,
    place,
  };
}
