import { apiRequest } from './client';

export type AnalyzePeriod = 'day' | 'week';

export type RecommendationItem = {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  change: {
    kind: string;
    taskId: number;
    volumeDeltaSets: number;
  };
};

export type AnalyzeResponse = {
  summary_text: string;
  assistant_reply: {
    id: number;
    role: string;
    text: string;
    period: AnalyzePeriod;
    period_from: string;
    period_to: string;
    source: 'llm' | 'rules';
    created_at: string;
  };
  diary_facts: Array<{
    note_date: string;
    feeling: string;
    weight_kg: number | null;
    user_comment: string | null;
  }>;
  screen_notice: string;
  recommendation: {
    id: number;
    user_id: number;
    period_from: string;
    period_to: string;
    source: 'llm' | 'rules';
    status: string;
    summary_text: string;
    items_json: RecommendationItem[];
    created_at: string;
  } | null;
};

export function analyzeWeek(
  date?: string,
  simulateTimeout = false,
): Promise<AnalyzeResponse> {
  return apiRequest<AnalyzeResponse>('/analyze', {
    method: 'POST',
    body: JSON.stringify({
      period: 'week',
      ...(date ? { date } : {}),
      ...(simulateTimeout ? { simulate_timeout: true } : {}),
    }),
  });
}
