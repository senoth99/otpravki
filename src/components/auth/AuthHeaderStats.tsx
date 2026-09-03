"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AllAccountsStats } from "@/components/auth/AllAccountsStats";

export function AuthHeaderStats() {
  const pathname = usePathname();
  const { user, stats, logout, refresh, openLogin } = useAuth();
  const [statsOpen, setStatsOpen] = useState(false);
  const onSborka = pathname === "/sborka" || pathname.startsWith("/sborka/");

  if (!user || !stats) {
    // Сборка работает без аккаунта — кнопку «Войти» не показываем.
    if (onSborka) return null;
    return (
      <button
        type="button"
        onClick={openLogin}
        className="inline-flex min-h-11 shrink-0 items-center rounded-2xl border border-gray-900 bg-gray-900 px-4 text-sm font-medium text-white active:bg-gray-800"
      >
        Войти
      </button>
    );
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void refresh();
            setStatsOpen(true);
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 py-1 pl-1.5 pr-3 text-left active:bg-gray-100"
          title="Статистика отправок"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-lg leading-none shadow-sm">
            {user.emoji}
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold leading-none tabular-nums text-gray-900">
              {stats.shift}
            </span>
            <span className="text-[11px] font-medium text-gray-400">смена</span>
          </span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void logout();
          }}
          className="inline-flex min-h-11 items-center rounded-2xl border border-red-200 bg-white px-3.5 text-sm font-medium text-red-700 active:bg-red-50"
        >
          Выйти
        </button>
      </div>

      {statsOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-gray-50 p-4 sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-900">Статистика</h2>
              <button
                type="button"
                onClick={() => setStatsOpen(false)}
                className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium active:bg-gray-50"
              >
                Закрыть
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Смена
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{stats.shift}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Сегодня
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{stats.today}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Всего
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{stats.total}</p>
              </div>
            </div>

            <AllAccountsStats />
          </div>
        </div>
      )}
    </>
  );
}
