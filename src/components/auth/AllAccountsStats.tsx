"use client";

import { useEffect, useState } from "react";

interface AccountRow {
  id: string;
  letter: string;
  emoji: string;
  total: number;
  today: number;
  lastShift: number;
}

export function AllAccountsStats({ compact = false }: { compact?: boolean }) {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/stats", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; accounts?: AccountRow[] };
        if (!cancelled && data.ok) setRows(data.accounts ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-center text-sm text-gray-500">Статистика…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500">
        Пока нет аккаунтов и отправок
      </p>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-gray-200 bg-white ${
        compact ? "" : "shadow-sm"
      }`}
    >
      <div className="border-b border-gray-100 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Статистика по аккаунтам
        </p>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-3 py-2 font-medium">Акк</th>
              <th className="px-2 py-2 font-medium">Сегодня</th>
              <th className="px-2 py-2 font-medium">Смена</th>
              <th className="px-3 py-2 font-medium">Всего</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <span className="text-base">{row.emoji}</span>{" "}
                  <span className="font-semibold text-gray-900">{row.letter}</span>
                </td>
                <td className="px-2 py-2 tabular-nums text-gray-700">{row.today}</td>
                <td className="px-2 py-2 tabular-nums text-gray-700">{row.lastShift}</td>
                <td className="px-3 py-2 tabular-nums font-medium text-gray-900">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
