"use client";

import { useEffect, useState, type ReactNode } from "react";
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

function AuthShell({ children }: { children: ReactNode }) {
  const { loading, user, setSession, lastShiftSummary, clearShiftSummary } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [canRegister, setCanRegister] = useState(true);

  useEffect(() => {
    if (user) return;
    void (async () => {
      try {
        const res = await fetch("/api/auth/users", { cache: "no-store" });
        const data = (await res.json()) as { canRegister?: boolean };
        setCanRegister(Boolean(data.canRegister));
      } catch {
        setCanRegister(true);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 text-sm text-gray-500">
        Загрузка…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-50">
        {lastShiftSummary !== null && (
          <LogoutShiftSummary
            shipments={lastShiftSummary}
            onClose={clearShiftSummary}
          />
        )}

        <header className="safe-top border-b border-gray-200 bg-white px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Отправки · CASHER</h1>
          <p className="text-xs text-gray-500">Вход по смайлику и PIN</p>
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

  return (
    <>
      {lastShiftSummary !== null && (
        <LogoutShiftSummary
          shipments={lastShiftSummary}
          onClose={clearShiftSummary}
        />
      )}
      {children}
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
