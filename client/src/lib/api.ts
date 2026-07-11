import { useAuthStore } from '@/store/authStore';

const BASE = import.meta.env.VITE_API_URL || '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });

  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new ApiError(401, 'Session expired — please log in again');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(
      res.status,
      body.error || body.message || `HTTP ${res.status}`,
      body
    );
  }

  return res.json();
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, d?: unknown) =>
    request<T>(p, {
      method: 'POST',
      body: d != null ? JSON.stringify(d) : undefined,
    }),
  patch: <T>(p: string, d?: unknown) =>
    request<T>(p, {
      method: 'PATCH',
      body: d != null ? JSON.stringify(d) : undefined,
    }),
  delete: <T>(p: string, opts?: { data?: unknown }) =>
    request<T>(p, {
      method: 'DELETE',
      body: opts?.data != null ? JSON.stringify(opts.data) : undefined,
    }),
};

export { ApiError };
