import { Prisma } from '@prisma/client';

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;

const FORBIDDEN_KEYS = new Set([
  'password',
  'passwordhash',
  'passwd',
  'secret',
  'token',
  'jwt',
  'apikey',
  'authorization',
  'payload',
  'rawpayload',
  'freenote',
  'bodyjson',
  'itemsjson',
  'messages',
  'hash',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isForbiddenKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (FORBIDDEN_KEYS.has(normalized)) {
    return true;
  }
  return (
    normalized.includes('password') ||
    normalized.includes('freenote') ||
    normalized.includes('comment') ||
    normalized.includes('payload') ||
    normalized.includes('apikey') ||
    normalized.includes('secret')
  );
}

function sanitizeObject(
  value: Record<string, unknown>,
): Prisma.InputJsonObject {
  const result: { [key: string]: Prisma.InputJsonValue | null } = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenKey(key)) {
      continue;
    }
    const clean = sanitizeValue(nested);
    if (clean !== undefined) {
      result[key] = clean;
    }
  }
  return result;
}

function sanitizeValue(
  value: unknown,
): Prisma.InputJsonValue | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    if (BCRYPT_HASH.test(value)) {
      return undefined;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter(
        (item): item is Prisma.InputJsonValue | null => item !== undefined,
      );
  }
  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return undefined;
}

/** Оставляет в журнале только безопасные поля. Пароль, хеш и сырой пакет отбрасываются. */
export function sanitizeJournalDetails(value: unknown): Prisma.InputJsonObject {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return sanitizeObject(value as Record<string, unknown>);
}
