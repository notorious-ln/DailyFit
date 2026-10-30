import {
  AssistantSource,
  Recommendation,
  RecommendationStatus,
} from '@prisma/client';
import { dateKey } from '../day/date.util';
import {
  RecommendationItem,
  absoluteVolumeDelta,
  fitsVolumeBudget,
} from '../assistant/rules-workout-recs';

export type RecommendationResponse = {
  id: number;
  user_id: number;
  period_from: string;
  period_to: string;
  source: AssistantSource;
  status: RecommendationStatus;
  summary_text: string;
  items_json: RecommendationItem[];
  created_at: string;
};

export function parseRecommendationItems(value: unknown): RecommendationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecommendationItem);
}

export function isRecommendationItem(value: unknown): value is RecommendationItem {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<RecommendationItem>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.selected === 'boolean' &&
    item.change != null &&
    typeof item.change === 'object' &&
    typeof item.change.kind === 'string' &&
    typeof item.change.taskId === 'number' &&
    typeof item.change.volumeDeltaSets === 'number'
  );
}

export function toRecommendationResponse(
  row: Recommendation,
): RecommendationResponse {
  return {
    id: row.id,
    user_id: row.userId,
    period_from: dateKey(row.periodFrom),
    period_to: dateKey(row.periodTo),
    source: row.source,
    status: row.status,
    summary_text: row.summaryText,
    items_json: parseRecommendationItems(row.itemsJson),
    created_at: row.createdAt.toISOString(),
  };
}

export function selectItemsForAccept(
  items: RecommendationItem[],
  selectedIds: string[] | undefined,
): RecommendationItem[] {
  if (selectedIds == null || selectedIds.length === 0) {
    return items;
  }
  const wanted = new Set(selectedIds);
  return items.filter((item) => wanted.has(item.id));
}

export function assertVolumeWithinLimit(
  items: RecommendationItem[],
  baseVolume: number,
): void {
  if (!fitsVolumeBudget(items, baseVolume)) {
    throw new Error(
      `VOLUME_LIMIT:${absoluteVolumeDelta(items)}/${baseVolume}`,
    );
  }
}
