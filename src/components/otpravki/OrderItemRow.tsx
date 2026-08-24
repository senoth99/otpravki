"use client";

import { formatSize } from "@/lib/format";
import { chestnyZnakStockStatus } from "@/lib/chestny-znak-status";
import type { ShippingOrderItem } from "@/types/shipping";
import { ChestnyZnakStatusIcon } from "./ChestnyZnakStatusIcon";
import { ProductImage } from "./ProductImage";
import { QuantityProgress } from "./QuantityProgress";

const STATUS_BADGE =
  "flex h-10 min-w-10 shrink-0 flex-col items-center justify-center rounded-xl px-2 tabular-nums";

const BTN =
  "flex h-11 min-h-[44px] items-center justify-center rounded-xl px-3.5 text-[13px] font-semibold uppercase tracking-normal transition-colors active:scale-[0.98]";

interface OrderItemRowProps {
  item: ShippingOrderItem;
  manual?: boolean;
  busy?: boolean;
  /** ЧЗ включён для упаковки (списание / блок −1) */
  chestnyZnakActive?: boolean;
  /** Скрыть иконку ЧЗ (блогерские заказы) */
  hideChestnyZnak?: boolean;
  remainingByGtin?: Record<string, number> | null;
  onIncrement?: () => void;
  onDecrement?: () => void;
  /** Мгновенная загрузка фото (отправки при листании заказов) */
  imagePriority?: boolean;
}

export function OrderItemRow({
  item,
  manual,
  busy,
  chestnyZnakActive = true,
  hideChestnyZnak = false,
  remainingByGtin = null,
  onIncrement,
  onDecrement,
  imagePriority = false,
}: OrderItemRowProps) {
  const isComplete = item.scannedCount >= item.quantity;
  const isPartial = item.scannedCount > 0 && !isComplete;
  const isMulti = item.quantity > 1;
  const hasChestnyZnak = chestnyZnakActive && Boolean(item.chestnyZnak?.trim());
  const czStock = chestnyZnakStockStatus(item.chestnyZnak, remainingByGtin);

  const badgeClass = isComplete
    ? "bg-green-500 text-white"
    : isPartial
      ? "bg-amber-400 text-white"
      : "bg-gray-100 text-gray-500";

  const czIcon = !hideChestnyZnak ? (
    <ChestnyZnakStatusIcon
      status={czStock.status}
      remaining={czStock.remaining}
      pending={czStock.pending}
      size="md"
    />
  ) : null;

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        isComplete
          ? "border-green-200 bg-green-50/60"
          : isPartial
            ? "border-amber-200 bg-amber-50/40"
            : "border-gray-100 bg-gray-50/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
            <ProductImage
              src={item.imageUrl}
              alt={item.productName}
              productName={item.productName}
              className="object-cover"
              sizes="56px"
              priority={imagePriority}
            />
            {isMulti && (
              <div className="absolute left-0.5 top-0.5 rounded-md bg-gray-900 px-1 text-[9px] font-bold text-white">
                ×{item.quantity}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-snug text-gray-900">
              {item.productName}
            </p>
            <p className="mt-0.5 text-xs text-gray-600">
              <span className="font-medium">{formatSize(item.size)}</span>
            </p>
          </div>
        </div>

        <div className="flex w-48 shrink-0 flex-col gap-2">
          <QuantityProgress quantity={item.quantity} doneCount={item.scannedCount} />

          <div className="flex h-11 min-h-[44px] items-center gap-2">
            {manual ? (
              <>
                {hasChestnyZnak ? (
                  czIcon
                ) : hideChestnyZnak ? (
                  <div className="h-10 w-10 shrink-0" aria-hidden />
                ) : (
                  <button
                    type="button"
                    onClick={onDecrement}
                    disabled={item.scannedCount === 0 || busy}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-600 transition-colors active:bg-gray-50 disabled:pointer-events-none disabled:border-transparent disabled:opacity-0"
                    aria-label="Убрать одну штуку"
                  >
                    −1
                  </button>
                )}
                <button
                  type="button"
                  onClick={onIncrement}
                  disabled={isComplete || busy}
                  className={`${BTN} min-w-0 flex-1 ${
                    isComplete
                      ? "cursor-default bg-green-500 text-white"
                      : "bg-gray-900 text-white active:bg-gray-800"
                  }`}
                >
                  <span className="px-0.5">
                    {isComplete ? "Готово" : busy ? "…" : "Упаковано"}
                  </span>
                </button>
              </>
            ) : (
              <div className="ml-auto flex h-11 items-center gap-1.5">
                {czIcon}
                <div className={`${STATUS_BADGE} ${badgeClass}`}>
                  {isMulti ? (
                    <>
                      <span className="text-sm font-bold leading-none">{item.scannedCount}</span>
                      <span
                        className={`mt-0.5 text-[10px] leading-none ${
                          isComplete || isPartial ? "text-white/80" : "text-gray-400"
                        }`}
                      >
                        / {item.quantity}
                      </span>
                    </>
                  ) : isComplete ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-xs font-medium">—</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
