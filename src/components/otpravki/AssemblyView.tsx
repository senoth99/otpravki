"use client";

import { useCallback } from "react";
import type { AssemblyViewSections } from "@/lib/assembly-demand";
import type { AssemblyItem } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { AssemblyItemCard } from "./AssemblyItemCard";

interface AssemblyViewProps {
  sections: AssemblyViewSections;
  allItems: AssemblyItem[];
  onItemsChange: (items: AssemblyItem[]) => void;
  warehouseMap?: WarehouseMapConfig;
}

function findCellHint(item: AssemblyItem, map: WarehouseMapConfig): string | undefined {
  for (const furniture of map.furniture) {
    for (const [key, cell] of Object.entries(furniture.cells)) {
      if (
        cell.productSlug === item.productId &&
        cell.sizes?.some((s) => s.toLowerCase() === item.size.toLowerCase())
      ) {
        const match = key.match(/^r(\d+)c(\d+)$/);
        if (match) {
          return `${furniture.label} Р${match[1]}Я${match[2]}`;
        }
      }
    }
  }
  return undefined;
}

function totalUnits(sections: AssemblyViewSections) {
  const all = [...sections.pending, ...sections.completed];
  return all.reduce((sum, item) => sum + item.quantity, 0);
}

function collectedUnits(sections: AssemblyViewSections) {
  const all = [...sections.pending, ...sections.completed];
  return all.reduce((sum, item) => sum + item.collectedCount, 0);
}

export function AssemblyView({ sections, allItems, onItemsChange, warehouseMap }: AssemblyViewProps) {
  const visibleItems = [...sections.pending, ...sections.completed];

  const findVisibleItem = useCallback(
    (id: string) => visibleItems.find((item) => item.id === id),
    [visibleItems],
  );

  const handleIncrement = useCallback(
    (id: string) => {
      const visible = findVisibleItem(id);
      if (!visible) return;

      onItemsChange(
        allItems.map((item) =>
          item.id === id && item.collectedCount < visible.quantity
            ? { ...item, collectedCount: item.collectedCount + 1, collectedAt: Date.now() }
            : item,
        ),
      );
    },
    [allItems, findVisibleItem, onItemsChange],
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

  const isEmpty = sections.pending.length === 0 && sections.completed.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">Позиции на сегодня</h2>
          <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
            Собранные позиции уходят вниз после переключения вкладки
          </p>
        </div>
        {!isEmpty && (
          <div className="self-start rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold tabular-nums text-gray-700">
            {collectedUnits(sections)} / {totalUnits(sections)}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">Всё собрано</p>
          <p className="mt-1 text-xs text-gray-500">Новые позиции появятся с неотправленными заказами</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.pending.length > 0 && (
            <div className="grid gap-2.5 sm:gap-3">
              {sections.pending.map((item) => (
                <AssemblyItemCard
                  key={item.id}
                  item={item}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  cellHint={warehouseMap ? findCellHint(item, warehouseMap) : undefined}
                />
              ))}
            </div>
          )}

          {sections.completed.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center gap-3 px-1">
                <p className="text-xs font-medium uppercase tracking-wide text-green-700">Собрано</p>
                <div className="h-px flex-1 bg-green-200" />
              </div>
              <div className="grid gap-2.5 sm:gap-3">
                {sections.completed.map((item) => (
                  <AssemblyItemCard
                    key={item.id}
                    item={item}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    cellHint={warehouseMap ? findCellHint(item, warehouseMap) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
