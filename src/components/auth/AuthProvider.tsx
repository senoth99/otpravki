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
  shift: number;
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
  shiftReminderOpen: boolean;
  dismissShiftReminder: () => void;
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
  const [shiftReminderOpen, setShiftReminderOpen] = useState(false);
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
      const res = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      // Только явный 401 — сессии нет. Сеть/5xx/abort при смене вкладки не разлогинивают.
      if (res.status === 401) {
        setUser(null);
        setStats(null);
        return false;
      }
      if (!res.ok) return true;
      const data = (await res.json()) as AuthMeResponse;
      return applyMe(data);
    } catch {
      return true;
    }
  }, [applyMe]);

  const logout = useCallback(async () => {
    let shiftShipments: number | null = null;
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        redirect: "manual",
      });
      // opaque redirect (0) / 3xx — не парсим как JSON
      if (res.ok && res.status !== 0) {
        const data = (await res.json()) as { ok?: boolean; shiftShipments?: number };
        if (typeof data.shiftShipments === "number") {
          shiftShipments = data.shiftShipments;
        }
      }
    } catch {
      // всё равно выходим
    }

    // Сначала логин-оверлей, без перезагрузки страницы (избегаем Chrome «couldn't load»)
    if (shiftShipments !== null) setLastShiftSummary(shiftShipments);
    setUser(null);
    setStats(null);
    setShiftReminderOpen(false);
    setLoginOpen(false);
  }, []);

  const clearShiftSummary = useCallback(() => setLastShiftSummary(null), []);
  const dismissShiftReminder = useCallback(() => setShiftReminderOpen(false), []);
  const openLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const setSession = useCallback((nextUser: AuthUserPublic, nextStats: AuthLiveStats) => {
    setUser(nextUser);
    setStats(nextStats);
    lastActivityRef.current = Date.now();
    setLastShiftSummary(null);
    setLoginOpen(false);
    setShiftReminderOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Таймаут 4 сек — если /api/auth/me завис, всё равно убираем экран загрузки
      await Promise.race([
        refresh(),
        new Promise<void>((resolve) => setTimeout(resolve, 4_000)),
      ]);
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
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, mark);
      }
      window.clearInterval(idleTimer);
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, logout, refresh]);

  const value = useMemo(
    () => ({
      loading,
      user,
      stats,
      lastShiftSummary,
      shiftReminderOpen,
      dismissShiftReminder,
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
      shiftReminderOpen,
      dismissShiftReminder,
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
