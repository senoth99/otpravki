"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface AuthUserPublic {
  id: string;
  emoji: string;
}

export interface AuthLiveStats {
  today: number;
  total: number;
}

interface AuthMeResponse {
  ok: boolean;
  user?: AuthUserPublic;
  stats?: AuthLiveStats;
  error?: string;
}

interface AuthContextValue {
  loading: boolean;
  user: AuthUserPublic | null;
  stats: AuthLiveStats | null;
  lastShiftSummary: number | null;
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearShiftSummary: () => void;
  setSession: (user: AuthUserPublic, stats: AuthLiveStats) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const IDLE_MS = 5 * 60 * 60 * 1000;
const HEARTBEAT_MS = 90_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUserPublic | null>(null);
  const [stats, setStats] = useState<AuthLiveStats | null>(null);
  const [lastShiftSummary, setLastShiftSummary] = useState<number | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());

  const applyMe = useCallback((data: AuthMeResponse) => {
    if (data.ok && data.user && data.stats) {
      setUser(data.user);
      setStats(data.stats);
      return true;
    }
    setUser(null);
    setStats(null);
    return false;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json()) as AuthMeResponse;
      if (!res.ok) {
        setUser(null);
        setStats(null);
        return false;
      }
      return applyMe(data);
    } catch {
      setUser(null);
      setStats(null);
      return false;
    }
  }, [applyMe]);

  const logout = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const data = (await res.json()) as { ok?: boolean; shiftShipments?: number };
      if (typeof data.shiftShipments === "number") {
        setLastShiftSummary(data.shiftShipments);
      }
    } catch {
      // ignore
    }
    setUser(null);
    setStats(null);
  }, []);

  const clearShiftSummary = useCallback(() => setLastShiftSummary(null), []);
  const openLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const setSession = useCallback((nextUser: AuthUserPublic, nextStats: AuthLiveStats) => {
    setUser(nextUser);
    setStats(nextStats);
    lastActivityRef.current = Date.now();
    setLastShiftSummary(null);
    setLoginOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    const mark = () => {
      lastActivityRef.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "mousemove",
    ];
    for (const event of events) {
      window.addEventListener(event, mark, { passive: true });
    }

    const idleTimer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_MS) {
        void logout();
      }
    }, 30_000);

    const heartbeat = window.setInterval(() => {
      void refresh().then((ok) => {
        if (!ok) void logout();
      });
    }, HEARTBEAT_MS);

    const onFocus = () => {
      void refresh().then((ok) => {
        if (!ok) void logout();
      });
    };
    window.addEventListener("focus", onFocus);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, mark);
      }
      window.clearInterval(idleTimer);
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, logout, refresh]);

  const value = useMemo(
    () => ({
      loading,
      user,
      stats,
      lastShiftSummary,
      loginOpen,
      openLogin,
      closeLogin,
      refresh,
      logout,
      clearShiftSummary,
      setSession,
    }),
    [
      loading,
      user,
      stats,
      lastShiftSummary,
      loginOpen,
      openLogin,
      closeLogin,
      refresh,
      logout,
      clearShiftSummary,
      setSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
