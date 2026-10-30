export type ExternalCallFailure = {
  reason: 'timeout' | 'http' | 'empty' | 'unavailable';
  http_status?: number;
};

function readErrorShape(error: unknown): {
  name: string;
  message: string;
} | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const candidate = error as { name?: unknown; message?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const message =
    typeof candidate.message === 'string' ? candidate.message : '';
  if (!name && !message) {
    return null;
  }
  return { name, message };
}

/** Класс сбоя внешнего вызова без текста ответа и без пакета запроса. */
export function classifyExternalCallError(error: unknown): ExternalCallFailure {
  const shape = readErrorShape(error);
  if (!shape) {
    return { reason: 'unavailable' };
  }
  if (shape.name === 'AbortError' || shape.name === 'TimeoutError') {
    return { reason: 'timeout' };
  }
  const http = /^LLM HTTP (\d+)$/.exec(shape.message);
  if (http) {
    return { reason: 'http', http_status: Number(http[1]) };
  }
  if (shape.message === 'LLM empty content') {
    return { reason: 'empty' };
  }
  return { reason: 'unavailable' };
}
