import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PublicUser } from "@govi/shared";
import { api } from "./api";

type AuthState = {
  user: PublicUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<PublicUser>;
  register: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (token: string, user: PublicUser) => void;
  refreshMe: () => Promise<PublicUser | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  });
  const [loading, setLoading] = useState(true);

  const setSession = useCallback((token: string, next: PublicUser) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(next));
    setUser(next);
  }, []);

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const me = await api<PublicUser>("/api/auth/me");
      localStorage.setItem("user", JSON.stringify(me));
      setUser(me);
      return me;
    } catch {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      localStorage.setItem("token", token);
      const refresh = params.get("refreshToken");
      if (refresh) localStorage.setItem("refreshToken", refresh);
      params.delete("token");
      params.delete("refreshToken");
      const clean =
        window.location.pathname +
        (params.toString() ? `?${params}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", clean);
    }
    refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api<{ token: string; user: PublicUser }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ username, password }),
        }
      );
      setSession(res.token, res.user);
      return res.user;
    },
    [setSession]
  );

  const register = useCallback(async (payload: Record<string, unknown>) => {
    await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setSession, refreshMe }),
    [user, loading, login, register, logout, setSession, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
