"use client";

import { useCallback } from "react";
import type { AssemblyItem } from "@/types/shipping";
import { AssemblyItemCard } from "./AssemblyItemCard";

interface AssemblyViewProps {
  items: AssemblyItem[];
  onItemsChange: (items: AssemblyItem[]) => void;
}

function totalUnits(items: AssemblyItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function collectedUnits(items: AssemblyItem[]) {
  return items.reduce((sum, item) => sum + item.collectedCount, 0);
}

export function AssemblyView({ items, onItemsChange }: AssemblyViewProps) {
  const handleIncrement = useCallback(
    (id: string) => {
      onItemsChange(
        items.map((item) =>
          item.id === id && item.collectedCount < item.quantity
            ? { ...item, collectedCount: item.collectedCount + 1, collectedAt: Date.now() }
            : item,
        ),
      );
    },
    [items, onItemsChange],
  );

  const handleDecrement = useCallback(
    (id: string) => {
      onItemsChange(
        items.map((item) =>
          item.id === id && item.collectedCount > 0
            ? { ...item, collectedCount: item.collectedCount - 1, collectedAt: Date.now() }
            : item,
        ),
      );
    },
    [items, onItemsChange],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">Позиции на сегодня</h2>
          <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
            Отметьте каждую штуку — одинаковые позиции считаются отдельно
          </p>
        </div>
        <div className="self-start rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold tabular-nums text-gray-700">
          {collectedUnits(items)} / {totalUnits(items)}
        </div>
      </div>

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
    </div>
  );
}
