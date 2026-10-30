import type { AuthResponse, PublicUser } from '../api/auth';

const TOKEN_KEY = 'dailyfit.token';
const USER_KEY = 'dailyfit.user';

export function saveSession(response: AuthResponse): void {
  localStorage.setItem(TOKEN_KEY, response.token);
  saveUser(response.user);
}

export function saveUser(user: PublicUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function readUser(): PublicUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}
