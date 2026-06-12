"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiStockItem, WarehouseMapConfig } from "@/types/stock";
import { StockList } from "./StockList";
import { WarehouseMap } from "./WarehouseMap";

type SkladTab = "stock" | "map";

const TABS: { id: SkladTab; label: string }[] = [
  { id: "stock", label: "Остатки" },
  { id: "map", label: "Карта" },
];

interface SkladPanelProps {
  initialStock: ApiStockItem[];
  initialMap: WarehouseMapConfig;
  stockError?: string;
}

export function SkladPanel({ initialStock, initialMap, stockError }: SkladPanelProps) {
  const [activeTab, setActiveTab] = useState<SkladTab>("stock");
  const [mapMounted, setMapMounted] = useState(false);

  useEffect(() => {
    if (activeTab === "map") setMapMounted(true);
  }, [activeTab]);
  const [stock, setStock] = useState(initialStock);
  const [refreshError, setRefreshError] = useState<string | undefined>(stockError);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshStock = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/stock", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data?: ApiStockItem[] };
      setStock(data.data ?? []);
      setRefreshError(undefined);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Ошибка обновления");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">Склад</h1>
          <button
            type="button"
            onClick={() => void refreshStock()}
            disabled={isRefreshing}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {isRefreshing ? "…" : "↻"}
          </button>
        </div>
        {/* Tab switcher */}
        <div className="flex w-full rounded-2xl border border-gray-200 bg-white p-1 shadow-sm sm:inline-flex sm:w-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-xl px-3 py-3 text-sm font-medium transition-colors sm:flex-none sm:px-5 sm:py-2.5 ${
                activeTab === tab.id
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-600 active:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stock error banner */}
      {refreshError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          Не удалось загрузить остатки: {refreshError}
        </div>
      )}

      {/* Content — keep map mounted to preserve edit state */}
      <div className={activeTab !== "stock" ? "hidden" : undefined}>
        <StockList items={stock} />
      </div>
      {mapMounted && (
        <div className={activeTab !== "map" ? "hidden" : undefined}>
          <WarehouseMap initialMap={initialMap} stock={stock} />
        </div>
      )}
    </div>
  );
}
