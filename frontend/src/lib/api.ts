// Thin API client. The base URL is injected at build time (VITE_API_URL).
// The session token (from the password gate) is kept in localStorage and sent
// as a Bearer token on every request.

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const TOKEN_KEY = 'hcm.session.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Raised when the server rejects our token; the UI logs out on this. */
export class AuthError extends ApiError {}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    // Let the app shell react (return to the login gate).
    window.dispatchEvent(new CustomEvent('hcm-unauthorized'));
    throw new AuthError(401, 'Session expired. Please sign in again.');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (password: string) =>
    request<{ token: string; expiresInSeconds: number }>('POST', '/auth/login', {
      password,
    }),

  list: <T>(resource: string) => request<T[]>('GET', `/${resource}`),
  create: <T>(resource: string, item: unknown) =>
    request<T>('POST', `/${resource}`, item),
  update: <T>(resource: string, id: string, item: unknown) =>
    request<T>('PUT', `/${resource}/${id}`, item),
  remove: (resource: string, id: string) =>
    request<void>('DELETE', `/${resource}/${id}`),

  getSettings: () =>
    request<{ id?: string; organizerEmail: string }>('GET', '/settings'),
  saveSettings: (organizerEmail: string) =>
    request<{ organizerEmail: string }>('PUT', '/settings', { organizerEmail }),

  getLog: <T>() => request<T[]>('GET', '/log'),
  addLog: (entry: unknown) => request<unknown>('POST', '/log', entry),
};
