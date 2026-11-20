const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface AuthUser {
  id: number;
  name?: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  is_active: boolean;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthUser | null> | null = null;

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.detail || 'Authentication failed';
  } catch {
    return 'Authentication failed';
  }
}

function acceptAuthResponse(data: AuthResponse): AuthUser {
  accessToken = data.access_token;
  return data.user;
}

export const authService = {
  getAccessToken(): string | null {
    return accessToken;
  },

  async login(email: string, password: string): Promise<AuthUser> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return acceptAuthResponse(await response.json() as AuthResponse);
  },

  async register(name: string, email: string, password: string): Promise<AuthUser> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as AuthUser;
  },

  async refresh(): Promise<AuthUser | null> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) {
          accessToken = null;
          return null;
        }
        return acceptAuthResponse(await response.json() as AuthResponse);
      } catch {
        accessToken = null;
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  },

  async restore(): Promise<AuthUser | null> {
    return this.refresh();
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      accessToken = null;
    }
  },

  async logoutAll(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/auth/logout-all`, {
        method: 'POST',
        credentials: 'include',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    } finally {
      accessToken = null;
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
    accessToken = null;
  },

  async adminCreateUser(user: { name?: string; email: string; password: string; role: 'admin' | 'analyst' | 'viewer' }): Promise<AuthUser> {
    const response = await apiFetch(`${API_BASE_URL}/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as AuthUser;
  },

  async adminGetUsers(): Promise<AuthUser[]> {
    const response = await apiFetch(`${API_BASE_URL}/auth/users`);
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as AuthUser[];
  },
};

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const isAuthRequest = requestUrl.includes('/auth/');

  const send = () => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers, credentials: 'include' });
  };

  let response = await send();
  if (response.status === 401 && accessToken && !isAuthRequest) {
    const user = await authService.refresh();
    if (user) {
      response = await send();
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('iotshield:session-expired'));
    }
  }
  return response;
}
