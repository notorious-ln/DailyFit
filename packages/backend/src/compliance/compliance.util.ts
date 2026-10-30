import { TaskStatus } from '@prisma/client';

/** Баллы статуса: выполнено — 1, частично — 0.5, пропущено — 0. */
export const STATUS_POINTS: Record<TaskStatus, number> = {
  [TaskStatus.done]: 1,
  [TaskStatus.partial]: 0.5,
  [TaskStatus.skipped]: 0,
};

/**
 * Процент соблюдения: сумма баллов / число задач × 100.
 * Задачи без статуса дают 0 баллов, но входят в знаменатель.
 */
export function compliancePercent(
  tasks: Array<{ status: TaskStatus | null }>,
): number | null {
  if (tasks.length === 0) {
    return null;
  }

  const total = tasks.reduce((sum, task) => {
    if (task.status == null) {
      return sum;
    }
    return sum + STATUS_POINTS[task.status];
  }, 0);

  return Math.round((total / tasks.length) * 1000) / 10;
}
