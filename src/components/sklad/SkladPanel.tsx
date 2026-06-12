"use client";

import { useState } from "react";
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-gray-900">Склад</h1>
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
      {stockError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          Не удалось загрузить остатки: {stockError}
        </div>
      )}

      {/* Content */}
      {activeTab === "stock" && <StockList items={initialStock} />}
      {activeTab === "map" && (
        <WarehouseMap initialMap={initialMap} stock={initialStock} />
      )}
    </div>
  );
}
