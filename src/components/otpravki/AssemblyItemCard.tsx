"use client";

import { useState } from "react";
import { WarehouseLocationModal } from "@/components/sklad/WarehouseLocationModal";
import { formatSize } from "@/lib/format";
import type { WarehouseCellLocation } from "@/lib/warehouse-location";
import type { AssemblyItem } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { BloggerBadge } from "./BloggerBadge";
import { ProductImage } from "./ProductImage";
import { QuantityTracker } from "./QuantityTracker";

interface AssemblyItemCardProps {
  item: AssemblyItem;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  cellLocation?: WarehouseCellLocation;
  warehouseMap?: WarehouseMapConfig;
  emphasize?: boolean;
  dimmed?: boolean;
  locked?: boolean;
  stepNumber?: number;
  navOpen?: boolean;
  onNavOpenChange?: (open: boolean) => void;
}

export function AssemblyItemCard({
  item,
  onIncrement,
  onDecrement,
  cellLocation,
  warehouseMap,
  emphasize = false,
  dimmed = false,
  locked = false,
  stepNumber,
  navOpen: navOpenProp,
  onNavOpenChange,
}: AssemblyItemCardProps) {
  const [navOpenLocal, setNavOpenLocal] = useState(false);
  const navOpen = navOpenProp ?? navOpenLocal;
  const setNavOpen = onNavOpenChange ?? setNavOpenLocal;
  const isComplete = item.collectedCount >= item.quantity;

  return (
    <div
      className={`relative flex w-full flex-col gap-3 rounded-2xl border p-3 transition-all sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${
        emphasize
          ? "border-gray-900 bg-white shadow-lg ring-2 ring-gray-900"
          : isComplete
            ? "border-green-300 bg-green-50 shadow-sm"
            : "border-gray-100 bg-white"
      } ${dimmed ? "pointer-events-none opacity-40 saturate-50" : ""}`}
    >
      {stepNumber !== undefined && (
        <div
          className={`absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-sm ${
            emphasize ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"
          }`}
        >
          {stepNumber}
        </div>
      )}
      <div className="flex min-w-0 items-start gap-3 sm:flex-1">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-20 sm:w-20">
          <ProductImage
            src={item.imageUrl}
            alt={item.productName}
            className={`object-cover transition-opacity ${isComplete ? "opacity-60" : ""}`}
            sizes="(max-width: 640px) 64px, 80px"
          />
          {item.quantity > 1 && (
            <div className="absolute left-1 top-1 rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
              ×{item.quantity}
            </div>
          )}
          {isComplete && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white shadow sm:h-8 sm:w-8">
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5 sm:py-1">
          <p
            className={`line-clamp-2 text-sm font-semibold leading-snug sm:truncate ${
              isComplete ? "text-green-800" : "text-gray-900"
            }`}
          >
            {item.productName}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{item.brand}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-2">
            <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {formatSize(item.size)}
            </span>
            {item.isBlogger && <BloggerBadge />}
            {cellLocation && (
              <button
                type="button"
                onClick={() => setNavOpen(true)}
                disabled={locked}
                className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 active:bg-blue-200 disabled:opacity-50"
              >
                {cellLocation.hint}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="w-full border-t border-gray-100 pt-3 sm:w-36 sm:shrink-0 sm:border-t-0 sm:pt-0">
        <QuantityTracker
          quantity={item.quantity}
          doneCount={item.collectedCount}
          onIncrement={locked ? () => {} : () => onIncrement(item.id)}
          onDecrement={locked ? () => {} : () => onDecrement(item.id)}
        />
      </div>

      {navOpen && warehouseMap && cellLocation && (
        <WarehouseLocationModal
          map={warehouseMap}
          location={cellLocation}
          productName={item.productName}
          stock={[
            {
              productSlug: item.productId,
              productName: item.productName,
              brand: item.brand,
              imageUrl: item.imageUrl,
              sizes: [{ id: 0, size: item.size, quantity: 0 }],
              totalQuantity: 0,
            },
          ]}
          onClose={() => setNavOpen(false)}
        />
      )}
    </div>
  );
}
