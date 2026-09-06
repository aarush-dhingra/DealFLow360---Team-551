// API client - proxied through Next.js rewrites to http://localhost:3001
const BASE = '/api/v1';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem('df360_token'); } catch { return null; }
}
export function setToken(token: string, user: object): void {
  localStorage.setItem('df360_token', token);
  localStorage.setItem('df360_user', JSON.stringify(user));
}
export function clearToken(): void {
  localStorage.removeItem('df360_token');
  localStorage.removeItem('df360_user');
}
export function getUser(): { id: string; email: string; displayName: string; roles: string[]; mustChangePassword?: boolean } | null {
  try {
    const raw = localStorage.getItem('df360_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && getToken()) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/';
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof body.error?.message === 'string' ? body.error.message
              : typeof body.message === 'string'        ? body.message
              : typeof body.error === 'string'          ? body.error
              : res.status === 409 ? 'This action conflicts with the current state. Please refresh and try again.'
              : res.status === 422 ? 'The submitted data is invalid. Please check your inputs.'
              : res.status === 403 ? 'You don\'t have permission to perform this action.'
              : res.status === 404 ? 'The requested resource was not found.'
              : 'Something went wrong. Please try again.';
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get:   <T>(path: string)              => request<T>(path),
  post:  <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:   <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
