"use client";

import type { WarehouseCellLocation } from "@/lib/warehouse-location";
import type { WarehouseMapConfig } from "@/types/stock";
import { WarehouseMap } from "./WarehouseMap";

interface WarehouseLocationModalProps {
  map: WarehouseMapConfig;
  location: WarehouseCellLocation;
  productName: string;
  onClose: () => void;
}

export function WarehouseLocationModal({
  map,
  location,
  productName,
  onClose,
}: WarehouseLocationModalProps) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{location.hint}</h2>
            <p className="mt-0.5 truncate text-sm text-gray-500">{productName}</p>
            <p className="mt-1 text-xs text-gray-400">
              Ряд {location.row} · Ячейка {location.col}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          <WarehouseMap
            initialMap={map}
            stock={[]}
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
