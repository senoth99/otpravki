"use client";

import { createPortal } from "react-dom";
import { BloggerBadge } from "@/components/otpravki/BloggerBadge";
import type { LocationGroupEntry } from "@/components/otpravki/AssemblyItemCard";
import { formatSize } from "@/lib/format";
import type { WarehouseCellLocation } from "@/lib/warehouse-location";
import type { ApiStockItem, WarehouseMapConfig } from "@/types/stock";
import { WarehouseMap } from "./WarehouseMap";

interface WarehouseLocationModalProps {
  map: WarehouseMapConfig;
  location: WarehouseCellLocation;
  productName: string;
  stock?: ApiStockItem[];
  onClose: () => void;
  onTake?: () => void;
  takeProgress?: { done: number; total: number };
  isBlogger?: boolean;
  locationGroup?: LocationGroupEntry[];
  locationGroupIndex?: number;
}

export function WarehouseLocationModal({
  map,
  location,
  productName,
  stock = [],
  onClose,
  onTake,
  takeProgress,
  isBlogger = false,
  locationGroup,
  locationGroupIndex = 1,
}: WarehouseLocationModalProps) {
  const rackLabel = location.furnitureLabel?.trim() || "Стеллаж";

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-white sm:items-center sm:justify-center sm:bg-black/50 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden sm:h-auto sm:max-h-[94dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-gray-100 sm:bg-white sm:shadow-xl">
        <div className="relative z-20 shrink-0 border-b border-amber-200 bg-gradient-to-b from-amber-50 to-white px-4 py-3 safe-top sm:border-gray-100 sm:bg-white sm:from-white sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 sm:hidden">
                Где взять на складе
              </p>
              <h2 className="mt-1 text-xl font-bold leading-tight text-gray-900 sm:mt-0 sm:text-base sm:font-semibold">
                {rackLabel}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-1">
                <span className="inline-flex items-center rounded-xl bg-amber-400 px-3.5 py-2 text-lg font-bold text-amber-950 shadow-sm sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-sm">
                  Ряд {location.row}
                </span>
                <span className="inline-flex items-center rounded-xl bg-gray-900 px-3.5 py-2 text-lg font-bold text-white shadow-sm sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-sm">
                  Я{location.col}
                </span>
                {isBlogger && <BloggerBadge className="rounded-xl px-3.5 py-2 text-sm sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-xs" />}
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-snug text-gray-600 sm:mt-0.5 sm:text-sm sm:text-gray-500">
                {productName}
              </p>
              <p className="mt-1 hidden text-xs text-gray-400 sm:block">
                {rackLabel} · ряд {location.row} · ячейка {location.col}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="relative z-20 shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 sm:py-1.5"
            >
              Закрыть
            </button>
          </div>
        </div>

        {locationGroup && locationGroup.length > 1 && (
          <div className="max-h-[26dvh] shrink-0 overflow-y-auto border-b border-amber-100 bg-amber-50/60 px-4 py-3 sm:max-h-none sm:overflow-visible sm:px-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              С этой ячейки · {locationGroup.length} шт. · сейчас {locationGroupIndex}/{locationGroup.length}
            </p>
            <ul className="mt-2 space-y-1.5">
              {locationGroup.map((entry, index) => (
                <li
                  key={entry.id}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
                    entry.isCurrent
                      ? "bg-white font-semibold text-gray-900 shadow-sm ring-1 ring-amber-300"
                      : entry.isComplete
                        ? "text-green-700 line-through opacity-70"
                        : "text-gray-600"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      entry.isCurrent
                        ? "bg-amber-400 text-amber-950"
                        : entry.isComplete
                          ? "bg-green-500 text-white"
                          : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {entry.isComplete ? "✓" : index + 1}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="line-clamp-2">{entry.productName}</span>
                    <span className="mt-0.5 block text-xs font-normal text-gray-500">
                      {formatSize(entry.size)}
                      {entry.isBlogger && (
                        <span className="ml-1.5 inline-flex align-middle">
                          <BloggerBadge className="px-1.5 py-0 text-[10px]" />
                        </span>
                      )}
                    </span>
                  </span>
                  {entry.isCurrent && (
                    <span className="shrink-0 rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                      Сейчас
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex min-h-[38dvh] flex-1 basis-0 flex-col px-1 py-1 sm:px-4 sm:py-3">
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

        {onTake && (
          <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 safe-bottom sm:px-5 sm:py-4">
            <button
              type="button"
              onClick={onTake}
              className="flex w-full min-h-[56px] items-center justify-center rounded-2xl bg-gray-900 px-6 py-4 text-lg font-bold uppercase tracking-wide text-white shadow-lg transition-transform active:scale-[0.98] active:bg-gray-800"
            >
              Взял
              {takeProgress && takeProgress.total > 1 && (
                <span className="ml-2 text-base font-semibold normal-case tracking-normal text-gray-300">
                  {takeProgress.done + 1} / {takeProgress.total}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
