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
  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-white sm:items-center sm:justify-center sm:bg-black/50 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden sm:h-auto sm:max-h-[94dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-gray-100 sm:bg-white sm:shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 safe-top sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{location.hint}</h2>
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{productName}</p>
            <p className="mt-1 text-xs text-gray-400">
              {location.furnitureLabel} · ряд {location.row} · ячейка {location.col}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Закрыть
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4 sm:py-3">
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
