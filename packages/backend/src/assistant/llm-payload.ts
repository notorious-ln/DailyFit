import { Feeling, TemplateType } from '@prisma/client';

/**
 * Закрытый набор полей для внешней модели.
 * Свободная пометка профиля сюда не входит.
 * Комментарий за день попадает только из явного запроса разбора.
 */
export const LLM_PAYLOAD_KEYS = [
  'goal',
  'level',
  'limitation_tags',
  'compliance_summary',
  'skip_count',
  'wellbeing',
  'active_plan_parameters',
  'user_day_comments',
] as const;

export type ComplianceSummary = {
  period: 'day' | 'week';
  from: string;
  to: string;
  workout_percent: number | null;
  meal_percent: number | null;
  overall_percent: number | null;
};

export type WellbeingPoint = {
  date: string;
  feeling: Feeling;
};

export type ActivePlanParameter = {
  type: TemplateType;
  title: string;
  level_place: string;
  daily_calories: number | null;
  days_per_week: number | null;
};

export type UserDayComment = {
  date: string;
  text: string;
};

export type LlmPayload = {
  goal: number | null;
  level: number | null;
  limitation_tags: string[];
  compliance_summary: ComplianceSummary;
  skip_count: number;
  wellbeing: WellbeingPoint[];
  active_plan_parameters: ActivePlanParameter[];
  user_day_comments: UserDayComment[];
};

export type LlmPayloadInput = {
  goal: number | null;
  level: number | null;
  limitationTags: string[];
  /** Есть в профиле и намеренно не копируется в сводку. */
  freeNote: string | null;
  compliance: ComplianceSummary;
  skipCount: number;
  wellbeing: WellbeingPoint[];
  activePlanParameters: ActivePlanParameter[];
  userDayComments: UserDayComment[];
};

export function buildLlmPayload(input: LlmPayloadInput): LlmPayload {
  return {
    goal: input.goal,
    level: input.level,
    limitation_tags: [...input.limitationTags],
    compliance_summary: input.compliance,
    skip_count: input.skipCount,
    wellbeing: input.wellbeing.map((point) => ({ ...point })),
    active_plan_parameters: input.activePlanParameters.map((plan) => ({
      ...plan,
    })),
    user_day_comments: input.userDayComments.map((comment) => ({
      ...comment,
    })),
  };
}
