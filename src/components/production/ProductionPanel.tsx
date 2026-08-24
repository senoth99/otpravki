"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductionQueueItem } from "@/types/production-api";

const BRANDS = ["CASHER", "SHECASH", "AMMO", "KURAZHDVIZH"] as const;

function itemKey(item: ProductionQueueItem): string {
  return `${item.storeBrand}:${item.product_id}:${item.size}`;
}

export function ProductionPanel() {
  const [brand, setBrand] = useState<string>("all");
  const [items, setItems] = useState<ProductionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modes, setModes] = useState<Array<{ brand: string; mode: string }>>([]);
  const [qtyByKey, setQtyByKey] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = brand === "all" ? "" : `?brand=${encodeURIComponent(brand)}`;
      const res = await fetch(`/api/production/queue${q}`, { cache: "no-store" });
      const data = (await res.json()) as {
        items?: ProductionQueueItem[];
        modes?: Array<{ brand: string; mode: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setItems(data.items ?? []);
      setModes(data.modes ?? []);
      setQtyByKey(() => {
        const next: Record<string, string> = {};
        for (const item of data.items ?? []) {
          next[itemKey(item)] = String(item.quantity_to_produce);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить очередь");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [brand]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => items, [items]);

  const receiveOne = async (item: ProductionQueueItem) => {
    const key = itemKey(item);
    if (busyKey) return;
    const raw = qtyByKey[key] ?? String(item.quantity_to_produce);
    const quantity = Math.floor(Number(raw));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setToast("Укажи количество > 0");
      return;
    }

    setBusyKey(key);
    setToast(null);
    try {
      const res = await fetch("/api/production/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: item.storeBrand,
          product_id: item.product_id,
          size: item.size,
          quantity,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        lines?: Array<{ received_quantity: number; stock: number; quantity: number }>;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const line = data.lines?.[0];
      setToast(
        line
          ? `Зачислено ${line.received_quantity} · остаток ${line.stock} · ещё шить ${line.quantity}`
          : "Приход принят",
      );
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Ошибка прихода");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Производство</h1>
          <p className="mt-1 text-sm text-gray-500">
            Очередь пошива Amarix · {visible.length} поз.
            {modes.length > 0 ? (
              <span className="ml-1 text-gray-400">
                (
                {modes
                  .map((m) => `${m.brand}:${m.mode === "production-api" ? "facility" : "admin"}`)
                  .join(", ")}
                )
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-11 items-center rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 active:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Обновляю…" : "Обновить"}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setBrand("all")}
          className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${
            brand === "all" ? "bg-gray-900 text-white" : "bg-white text-gray-800 border border-gray-200"
          }`}
        >
          Все
        </button>
        {BRANDS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBrand(b)}
            className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${
              brand === b ? "bg-gray-900 text-white" : "bg-white text-gray-800 border border-gray-200"
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {toast ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-900">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {loading && visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500">Загружаю очередь…</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500">Очередь пуста — шить нечего</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => {
            const key = itemKey(item);
            const busy = busyKey === key;
            return (
              <li
                key={key}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {item.storeBrand}
                      {item.on_demand ? " · под заказ" : ""}
                      {item.link_only ? " · link only" : ""}
                    </p>
                    <p className="mt-1 text-base font-semibold text-gray-900">
                      {item.product_name}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      Размер <span className="font-semibold text-gray-900">{item.size}</span>
                      {" · "}шить{" "}
                      <span className="font-semibold text-gray-900">
                        {item.quantity_to_produce}
                      </span>
                      {" · "}сток {item.stock}
                      {" · "}партия {item.batch_size}
                    </p>
                    {item.chestny_znak ? (
                      <p className="mt-1 font-mono text-xs text-gray-400">{item.chestny_znak}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3">
                    <span className="text-xs text-gray-500">Приход</span>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      data-no-drag-scroll
                      value={qtyByKey[key] ?? String(item.quantity_to_produce)}
                      onChange={(e) =>
                        setQtyByKey((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="w-20 bg-transparent text-base font-semibold text-gray-900 outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || Boolean(busyKey)}
                    onClick={() => void receiveOne(item)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white active:bg-gray-800 disabled:opacity-50 sm:flex-none"
                  >
                    {busy ? "Отправляю…" : "Вернуть на склад"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="pb-6 text-xs text-gray-400">
        Приход не идемпотентен: не жми дважды. При таймауте сначала обнови очередь и сверь
        stock / quantity.
      </p>
    </div>
  );
}
