"use client";

import { useEffect, useState } from "react";

interface AccountRow {
  id: string;
  emoji: string;
  total: number;
  today: number;
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
              <th className="px-3 py-2 text-left font-medium">Акк</th>
              <th className="px-3 py-2 text-right font-medium">Сегодня</th>
              <th className="px-3 py-2 text-right font-medium">Всего</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2.5">
                  <span className="text-xl leading-none">{row.emoji}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-base font-semibold tabular-nums text-gray-900">
                  {row.today}
                </td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-500">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
