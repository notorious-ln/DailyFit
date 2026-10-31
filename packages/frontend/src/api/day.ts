import { apiRequest } from './client';

export type TaskStatus = 'done' | 'partial' | 'skipped';

export type DayTask = {
  id: number;
  plan_id: number;
  task_date: string;
  kind: string;
  title: string;
  status: TaskStatus | null;
  details_json: Record<string, unknown> | null;
  completed_at: string | null;
};

export type DayView = {
  date: string;
  tasks: DayTask[];
  day_compliance_percent: number | null;
  week_compliance_percent: number | null;
  readonly: boolean;
};

export function getDay(date: string): Promise<DayView> {
  return apiRequest<DayView>(`/day/${date}`);
}

export function updateDayTasks(
  date: string,
  tasks: Array<{ id: number; status: TaskStatus }>,
): Promise<DayView> {
  return apiRequest<DayView>(`/day/${date}/tasks`, {
    method: 'PUT',
    body: JSON.stringify({ tasks }),
  });
}
