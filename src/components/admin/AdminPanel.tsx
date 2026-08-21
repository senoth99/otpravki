"use client";

import { useEffect, useState } from "react";
import { AuthHeaderStats } from "@/components/auth/AuthHeaderStats";
import { AssemblyExtrasEditor } from "@/components/admin/AssemblyExtrasEditor";
import { PinNumpad } from "@/components/chestnye-znaki/PinNumpad";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { mutatingApiHeaders } from "@/lib/api-headers";

type AdminView = "loading" | "pin" | "menu" | "extras";

export function AdminPanel() {
  useOtpravkiNoSwipe();
  const [view, setView] = useState<AdminView>("loading");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [printMessage, setPrintMessage] = useState<{ ok: boolean; text: string } | null>(null);

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

  const leaveAdmin = async () => {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
    } catch {
      // всё равно уходим
    }
    window.location.href = "/otpravki";
  };

  const printTestLabel = async (kind: "ammo" | "kurazh" | "track") => {
    if (busy) return;
    setBusy(true);
    setPrintMessage(null);
    try {
      const res = await fetch("/api/print/test", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { ...mutatingApiHeaders(), Accept: "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; printer?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "Не удалось напечатать");
      }
      setPrintMessage({
        ok: true,
        text: `Отправлено на ${data.printer ?? "принтер"}`,
      });
    } catch (err) {
      setPrintMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Ошибка печати",
      });
    } finally {
      setBusy(false);
    }
  };

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
              <button
                type="button"
                onClick={() => void leaveAdmin()}
                className="inline-flex h-9 shrink-0 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
              >
                Назад
              </button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-gray-900">Админка</h1>
              <p className="text-xs text-gray-500">
                {view === "extras" ? "Допы сборки" : "Честные знаки, допы и тест печати"}
              </p>
            </div>
          </div>
          <AuthHeaderStats />
        </div>
      </header>

      <main className="min-h-0 flex-1 touch-scroll-y overflow-y-auto p-3 sm:p-4">
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
            <a
              href="/gaidy"
              className="flex min-h-20 items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm active:scale-[0.99]"
            >
              <span>
                <span className="block text-base font-semibold text-gray-900">Гайды</span>
                <span className="mt-0.5 block text-sm text-gray-500">Инструкции и QR на страницы</span>
              </span>
              <span className="text-gray-400">→</span>
            </a>
            <a
              href="/obzor"
              className="flex min-h-20 items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm active:scale-[0.99]"
            >
              <span>
                <span className="block text-base font-semibold text-gray-900">Обзор</span>
                <span className="mt-0.5 block text-sm text-gray-500">Цифры и вещи к отправке</span>
              </span>
              <span className="text-gray-400">→</span>
            </a>

            <section className="mt-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Тест печати 150×100
              </p>
              {(
                [
                  { kind: "ammo", label: "Тест баркодник AMMO" },
                  { kind: "kurazh", label: "Тест баркодник Кураж" },
                  { kind: "track", label: "Тест этикетки трека" },
                ] as const
              ).map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  disabled={busy}
                  onClick={() => void printTestLabel(item.kind)}
                  className="flex min-h-16 w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm active:scale-[0.99] disabled:opacity-50"
                >
                  <span className="block text-base font-semibold text-gray-900">{item.label}</span>
                  <span className="text-sm text-gray-400">Печать</span>
                </button>
              ))}
              {printMessage && (
                <p
                  className={`rounded-xl px-3 py-2 text-sm ${
                    printMessage.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                  }`}
                >
                  {printMessage.text}
                </p>
              )}
            </section>
          </div>
        )}

        {view === "extras" && <AssemblyExtrasEditor />}
      </main>
    </div>
  );
}
