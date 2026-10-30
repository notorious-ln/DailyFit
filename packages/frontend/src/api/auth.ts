import { apiRequest } from './client';

export type PublicUser = {
  id: number;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  goal: number | null;
  level: number | null;
};

export type AuthResponse = {
  token: string;
  user: PublicUser;
};

export type AuthCredentials = {
  email: string;
  password: string;
  display_name?: string;
};

export function login(credentials: AuthCredentials): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/login', {
    method: 'POST',
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
}

export function register(credentials: AuthCredentials): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/register', {
    method: 'POST',
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
      ...(credentials.display_name
        ? { display_name: credentials.display_name }
        : {}),
    }),
  });
}
