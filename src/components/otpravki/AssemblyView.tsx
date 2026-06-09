"use client";

import { useCallback } from "react";
import type { AssemblyItem } from "@/types/shipping";
import { AssemblyItemCard } from "./AssemblyItemCard";

interface AssemblyViewProps {
  items: AssemblyItem[];
  allItems: AssemblyItem[];
  onItemsChange: (items: AssemblyItem[]) => void;
}

function totalUnits(items: AssemblyItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function collectedUnits(items: AssemblyItem[]) {
  return items.reduce((sum, item) => sum + item.collectedCount, 0);
}

export function AssemblyView({ items, allItems, onItemsChange }: AssemblyViewProps) {
  const handleIncrement = useCallback(
    (id: string) => {
      const pending = items.find((item) => item.id === id);
      if (!pending) return;

      onItemsChange(
        allItems.map((item) =>
          item.id === id && item.collectedCount < pending.quantity
            ? { ...item, collectedCount: item.collectedCount + 1, collectedAt: Date.now() }
            : item,
        ),
      );
    },
    [allItems, items, onItemsChange],
  );

  const handleDecrement = useCallback(
    (id: string) => {
      onItemsChange(
        allItems.map((item) =>
          item.id === id && item.collectedCount > 0
            ? { ...item, collectedCount: item.collectedCount - 1, collectedAt: Date.now() }
            : item,
        ),
      );
    },
    [allItems, onItemsChange],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">Позиции на сегодня</h2>
          <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
            Только позиции, которые ещё нужно собрать перед отправкой
          </p>
        </div>
        <div className="self-start rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold tabular-nums text-gray-700">
          {collectedUnits(items)} / {totalUnits(items)}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">Всё собрано</p>
          <p className="mt-1 text-xs text-gray-500">Новые позиции появятся с неотправленными заказами</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:gap-3">
          {items.map((item) => (
            <AssemblyItemCard
              key={item.id}
              item={item}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
            />
          ))}
        </div>
      )}
    </div>
  );
}
