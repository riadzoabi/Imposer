import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
}

export interface Subscription {
  id: number;
  plan: string;
  status: string;
  expires_at: string | null;
}

export interface DeviceLimit {
  allowed: boolean;
  current: number;
  max: number;
  plan: string | null;
}

interface AuthState {
  user: User | null;
  subscription: Subscription | null;
  deviceLimit: DeviceLimit | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  subscribe: (plan: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  isAuthenticated: boolean;
  isSubscribed: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ── Device fingerprint ─────────────────────────────────────────────
// Simple fingerprint based on browser properties. PLACEHOLDER: use a
// real fingerprinting library (e.g. FingerprintJS) in production.

function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  // Simple hash
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'fp_' + Math.abs(hash).toString(36);
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome Browser';
  if (ua.includes('Firefox')) return 'Firefox Browser';
  if (ua.includes('Safari')) return 'Safari Browser';
  if (ua.includes('Edge')) return 'Edge Browser';
  return 'Browser';
}

// ── API helpers ────────────────────────────────────────────────────

const BASE = '/api';

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Provider ───────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    subscription: null,
    deviceLimit: null,
    token: localStorage.getItem('auth_token'),
    loading: true,
  });

  const setAuth = useCallback((patch: Partial<AuthState>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  // Check existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setAuth({ loading: false });
      return;
    }

    apiFetch('/auth/me')
      .then(data => {
        setAuth({
          user: data.user,
          subscription: data.subscription,
          deviceLimit: data.device_limit,
          token,
          loading: false,
        });
      })
      .catch(() => {
        // Token invalid/expired
        localStorage.removeItem('auth_token');
        setAuth({ user: null, subscription: null, token: null, loading: false });
      });
  }, [setAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        device_fingerprint: getDeviceFingerprint(),
        device_name: getDeviceName(),
      }),
    });

    localStorage.setItem('auth_token', data.token);
    setAuth({
      user: data.user,
      subscription: data.subscription,
      token: data.token,
      loading: false,
    });
  }, [setAuth]);

  const register = useCallback(async (email: string, password: string) => {
    await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    // Auto-login after registration
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors on logout
    }
    localStorage.removeItem('auth_token');
    setAuth({ user: null, subscription: null, deviceLimit: null, token: null });
  }, [setAuth]);

  const subscribe = useCallback(async (plan: string) => {
    const data = await apiFetch('/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });

    // In development, auto-activates. In production, redirect to checkout_url.
    if (data.checkout_url && data.checkout_url.startsWith('http')) {
      window.location.href = data.checkout_url;  // PLACEHOLDER: Stripe redirect
    }

    // Refresh subscription status
    const status = await apiFetch('/subscription/status');
    setAuth({
      subscription: status.subscription,
      deviceLimit: status.device_limit,
    });
  }, [setAuth]);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/auth/me');
      setAuth({
        user: data.user,
        subscription: data.subscription,
        deviceLimit: data.device_limit,
      });
    } catch {
      // Ignore
    }
  }, [setAuth]);

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    subscribe,
    refreshStatus,
    isAuthenticated: !!state.user,
    isSubscribed: !!state.subscription && state.subscription.status === 'active',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── Authenticated fetch helper ─────────────────────────────────────
// Export so api.ts can use it for all API calls.

export { apiFetch };
