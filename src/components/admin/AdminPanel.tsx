"use client";

import { useEffect, useState } from "react";
import { AuthHeaderStats } from "@/components/auth/AuthHeaderStats";
import { AssemblyExtrasEditor } from "@/components/admin/AssemblyExtrasEditor";
import { PinNumpad } from "@/components/chestnye-znaki/PinNumpad";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";

type AdminView = "loading" | "pin" | "menu" | "extras";

export function AdminPanel() {
  useOtpravkiNoSwipe();
  const [view, setView] = useState<AdminView>("loading");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/session", { cache: "no-store" });
        if (!cancelled) setView(res.ok ? "menu" : "pin");
      } catch {
        if (!cancelled) setView("pin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitPin = async (entered: string) => {
    if (entered.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/verify-pin", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ pin: entered }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Неверный PIN");
      }
      setPin("");
      setView("menu");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="otpravki-shell flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50">
      <header className="safe-top shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {view === "extras" ? (
              <button
                type="button"
                onClick={() => setView("menu")}
                className="inline-flex h-9 shrink-0 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
              >
                Назад
              </button>
            ) : (
              <a
                href="/otpravki"
                className="inline-flex h-9 shrink-0 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
              >
                Назад
              </a>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-gray-900">Админка</h1>
              <p className="text-xs text-gray-500">
                {view === "extras" ? "Допы сборки" : "Честные знаки и допы"}
              </p>
            </div>
          </div>
          <AuthHeaderStats />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {view === "loading" && (
          <p className="py-16 text-center text-sm text-gray-500">Загрузка…</p>
        )}

        {view === "pin" && (
          <div className="mx-auto flex w-full max-w-md flex-col justify-center space-y-6 py-10 text-center">
            <div>
              <p className="text-sm font-medium text-gray-900">Введите PIN админки</p>
              <p className="mt-1 text-xs text-gray-500">4 цифры</p>
            </div>
            <PinNumpad
              value={pin}
              onChange={(next) => {
                setPin(next);
                if (next.length === 4) void submitPin(next);
              }}
              disabled={busy}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {view === "menu" && (
          <div className="mx-auto grid w-full max-w-lg gap-3 py-6">
            <a
              href="/chestnye-znaki"
              className="flex min-h-20 items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm active:scale-[0.99]"
            >
              <span>
                <span className="block text-base font-semibold text-gray-900">Честные знаки</span>
                <span className="mt-0.5 block text-sm text-gray-500">Печать и списание КМ</span>
              </span>
              <span className="text-gray-400">→</span>
            </a>
            <button
              type="button"
              onClick={() => setView("extras")}
              className="flex min-h-20 items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm active:scale-[0.99]"
            >
              <span>
                <span className="block text-base font-semibold text-gray-900">
                  Настройка допов сборки
                </span>
                <span className="mt-0.5 block text-sm text-gray-500">
                  Что класть в заказ по брендам
                </span>
              </span>
              <span className="text-gray-400">→</span>
            </button>
          </div>
        )}

        {view === "extras" && <AssemblyExtrasEditor />}
      </main>
    </div>
  );
}
