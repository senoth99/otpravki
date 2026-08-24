"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  AuthProvider,
  useAuth,
  type AuthLiveStats,
  type AuthUserPublic,
} from "@/components/auth/AuthProvider";
import { AllAccountsStats } from "@/components/auth/AllAccountsStats";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { LogoutShiftSummary } from "@/components/auth/LogoutShiftSummary";
import { RegisterScreen } from "@/components/auth/RegisterScreen";
import { ShiftStartReminder } from "@/components/auth/ShiftStartReminder";
import { usePointerDragScroll } from "@/hooks/usePointerDragScroll";

/** Без логина: инструкция и скрытые гайды (только по ссылке). Остальное — после входа. */
function isGuestPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/instrukciya" ||
    pathname.startsWith("/instrukciya/") ||
    pathname === "/gaidy" ||
    pathname.startsWith("/gaidy/") ||
    pathname === "/obzor" ||
    pathname.startsWith("/obzor/")
  );
}

function AuthLoginPanel({
  embedded,
  onClose,
}: {
  embedded?: boolean;
  onClose?: () => void;
}) {
  const { setSession, lastShiftSummary, clearShiftSummary } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [canRegister, setCanRegister] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/users", { cache: "no-store" });
        const data = (await res.json()) as { canRegister?: boolean };
        setCanRegister(Boolean(data.canRegister));
      } catch {
        setCanRegister(true);
      }
    })();
  }, []);

  return (
    <div
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col bg-gray-50"
          : "flex min-h-dvh flex-col bg-gray-50"
      }
    >
      {lastShiftSummary !== null && (
        <LogoutShiftSummary shipments={lastShiftSummary} onClose={clearShiftSummary} />
      )}

      <header className="safe-top border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Отправки · CASHER</h1>
            <p className="text-xs text-gray-500">Вход по смайлику и PIN</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/instrukciya"
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 active:bg-gray-50"
            >
              Инструкция
            </a>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 active:bg-gray-50"
              >
                Назад
              </button>
            )}
          </div>
        </div>
      </header>

      {mode === "login" ? (
        <LoginScreen
          canRegister={canRegister}
          onGoRegister={() => setMode("register")}
          onSuccess={(nextUser: AuthUserPublic, stats: AuthLiveStats) => {
            setSession(nextUser, stats);
          }}
        />
      ) : (
        <RegisterScreen
          onBack={() => setMode("login")}
          onSuccess={(nextUser: AuthUserPublic, stats: AuthLiveStats) => {
            setSession(nextUser, stats);
          }}
        />
      )}

      <div className="mx-auto w-full max-w-lg px-4 pb-6">
        <AllAccountsStats compact />
      </div>
    </div>
  );
}

/** Определяем открытие в iframe — в этом случае auth-gate пропускаем */
function useIsEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get("embedded");
    if (explicit === "1" || explicit === "true") {
      setEmbedded(true);
      return;
    }

    try {
      setEmbedded(window.self !== window.top);
    } catch {
      setEmbedded(true);
    }
  }, []);
  return embedded;
}

function AuthShell({ children }: { children: ReactNode }) {
  usePointerDragScroll();
  const pathname = usePathname();
  const isEmbedded = useIsEmbedded();
  const {
    loading,
    user,
    loginOpen,
    closeLogin,
    shiftReminderOpen,
    dismissShiftReminder,
  } = useAuth();
  const guestPublic = isGuestPublicPath(pathname);
  // Держим страницу смонтированной под оверлеем, чтобы Chrome не мигал «couldn't load».
  // Не используем display:contents — в Chrome он роняет вкладку при тяжёлых ре-рендерах
  // (смена бренда, поиск по треку и т.п.).
  const keepMounted = useRef(false);
  if (user || guestPublic || isEmbedded) keepMounted.current = true;

  // В iframe — показываем приложение сразу без auth
  const showApp = Boolean(user) || guestPublic || isEmbedded;
  const showBlockingLogin = !user && !loading && !guestPublic && !isEmbedded;
  const showLoginOverlay = !user && !loading && guestPublic && loginOpen && !isEmbedded;

  if (loading && !keepMounted.current && !showBlockingLogin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 text-sm text-gray-500">
        Загрузка…
      </div>
    );
  }

  return (
    <>
      {keepMounted.current ? (
        <div
          className={
            showApp
              ? "flex min-h-dvh flex-1 flex-col"
              : "pointer-events-none fixed inset-0 -z-10 h-0 overflow-hidden opacity-0"
          }
          aria-hidden={!showApp}
        >
          {children}
        </div>
      ) : null}

      {showBlockingLogin ? (
        <div className="fixed inset-0 z-[70] touch-scroll-y overflow-y-auto bg-gray-50">
          <AuthLoginPanel />
        </div>
      ) : null}

      {showLoginOverlay ? (
        <div className="fixed inset-0 z-[80] touch-scroll-y overflow-y-auto bg-gray-50">
          <AuthLoginPanel embedded onClose={closeLogin} />
        </div>
      ) : null}

      {user && shiftReminderOpen && !isEmbedded ? (
        <ShiftStartReminder emoji={user.emoji} onContinue={dismissShiftReminder} />
      ) : null}
    </>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthShell>{children}</AuthShell>
    </AuthProvider>
  );
}

export { useAuth } from "@/components/auth/AuthProvider";
