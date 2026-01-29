const AUTH_STORAGE_KEY = 'ipc-auth';

interface StoredAuth {
  token: string;
  userId: string;
  createdAt: number;
}

const isBrowser = typeof window !== 'undefined';

const readStorage = (): StoredAuth | null => {
  if (!isBrowser) return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAuth;
    if (parsed?.token && parsed?.userId) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const writeStorage = (value: StoredAuth) => {
  if (!isBrowser) return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
};

export const clearAuthStorage = () => {
  if (!isBrowser) return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
};

export const ensureAuthSession = async (): Promise<StoredAuth> => {
  const cached = readStorage();
  if (cached) {
    return cached;
  }

  const response = await fetch('/api/auth/anonymous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to initialize session');
  }

  const data = (await response.json()) as { token: string; user: { id: string } };
  const stored = {
    token: data.token,
    userId: data.user.id,
    createdAt: Date.now(),
  } satisfies StoredAuth;
  writeStorage(stored);
  return stored;
};

export const getToken = async () => {
  const session = await ensureAuthSession();
  return session.token;
};

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export const authorizedFetch = async (input: FetchInput, init: FetchInit = {}) => {
  const token = await getToken();
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, {
    ...init,
    headers,
  });
};
