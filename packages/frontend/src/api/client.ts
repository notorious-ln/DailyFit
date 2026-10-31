import { readToken } from '../auth/session';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export type ApiErrorBody = {
  message?: string | string[];
  statusCode?: number;
  requires_confirm?: boolean;
  current_plan_id?: number;
  suggested_calories?: number | null;
  needs_manual_input?: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function readMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') {
    return fallback;
  }
  const message = (body as ApiErrorBody).message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  if (Array.isArray(message) && message.length > 0) {
    return message.filter((item) => typeof item === 'string').join(' ');
  }
  return fallback;
}

export function asErrorBody(body: unknown): ApiErrorBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  return body as ApiErrorBody;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = readToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      readMessage(body, 'Не удалось выполнить запрос'),
      body,
    );
  }

  return body as T;
}
