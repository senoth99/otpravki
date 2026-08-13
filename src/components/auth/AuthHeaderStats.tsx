"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AllAccountsStats } from "@/components/auth/AllAccountsStats";

export function AuthHeaderStats() {
  const { user, stats, logout, refresh } = useAuth();
  const [statsOpen, setStatsOpen] = useState(false);

  if (!user || !stats) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void refresh();
            setStatsOpen(true);
          }}
          className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-900"
          title="Статистика"
        >
          <span className="text-base leading-none">{user.emoji}</span>
          <span className="font-bold">{user.letter}</span>
          <span className="truncate text-xs text-gray-500">
            сегодня {stats.today} · смена {stats.shift}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex h-9 items-center rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700"
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
                className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium"
              >
                Закрыть
              </button>
            </div>
            <AllAccountsStats />
          </div>
        </div>
      )}
    </>
  );
}
