"use client";

import type { WarehouseCellLocation } from "@/lib/warehouse-location";
import type { ApiStockItem, WarehouseMapConfig } from "@/types/stock";
import { WarehouseMap } from "./WarehouseMap";

interface WarehouseLocationModalProps {
  map: WarehouseMapConfig;
  location: WarehouseCellLocation;
  productName: string;
  stock?: ApiStockItem[];
  onClose: () => void;
}

export function WarehouseLocationModal({
  map,
  location,
  productName,
  stock = [],
  onClose,
}: WarehouseLocationModalProps) {
  const rackLabel = location.furnitureLabel?.trim() || "Стеллаж";

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-white sm:items-center sm:justify-center sm:bg-black/50 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden sm:h-auto sm:max-h-[94dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-gray-100 sm:bg-white sm:shadow-xl">
        <div className="shrink-0 border-b border-amber-200 bg-gradient-to-b from-amber-50 to-white px-4 py-4 safe-top sm:border-gray-100 sm:bg-white sm:from-white sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 sm:hidden">
                Где взять на складе
              </p>
              <h2 className="mt-1 text-xl font-bold leading-tight text-gray-900 sm:mt-0 sm:text-base sm:font-semibold">
                {rackLabel}
              </h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:mt-1">
                <span className="inline-flex items-center rounded-xl bg-amber-400 px-3.5 py-2 text-lg font-bold text-amber-950 shadow-sm sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-sm">
                  Ряд {location.row}
                </span>
                <span className="inline-flex items-center rounded-xl bg-gray-900 px-3.5 py-2 text-lg font-bold text-white shadow-sm sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-sm">
                  Я{location.col}
                </span>
              </div>
              <p className="mt-2.5 line-clamp-2 text-sm leading-snug text-gray-600 sm:mt-0.5 sm:text-sm sm:text-gray-500">
                {productName}
              </p>
              <p className="mt-1 hidden text-xs text-gray-400 sm:block">
                {rackLabel} · ряд {location.row} · ячейка {location.col}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 sm:py-1.5"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-1 py-1 sm:overflow-y-auto sm:px-4 sm:py-3">
          <WarehouseMap
            initialMap={map}
            stock={stock}
            readOnly
            navigateTarget={{
              furnitureId: location.furnitureId,
              cellKey: location.cellKey,
            }}
          />
        </div>
      </div>
    </div>
  );
}
