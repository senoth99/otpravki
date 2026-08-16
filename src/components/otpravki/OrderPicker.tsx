"use client";

import { useMemo } from "react";
import { formatMoscowDate, formatOrderNumberShort } from "@/lib/format";
import { type OrderDisplayStatus } from "@/lib/order-status";
import { getSortedOrderIndices } from "@/lib/order-sort";
import type { ShippingOrder } from "@/types/shipping";

interface OrderPickerProps {
  orders: ShippingOrder[];
  currentIndex: number;
  statuses: OrderDisplayStatus[];
  onSelect: (index: number) => void;
  locked?: boolean;
  /** Индексы заказов, видимых в пикере (по умолчанию — все) */
  visibleIndices?: number[];
}

function tabClass(active: boolean): string {
  if (active) {
    return "border-gray-900 bg-gray-900 text-white shadow-sm";
  }
  return "border-gray-200 bg-white text-gray-900";
}

function OrderTabContent({
  order,
  active,
}: {
  order: ShippingOrder;
  active: boolean;
}) {
  return (
    <>
      <p className="w-full truncate text-sm font-semibold leading-tight">
        {formatOrderNumberShort(order.orderNumber)}
      </p>
      <p
        className={`mt-0.5 w-full truncate text-[11px] leading-tight ${
          active ? "text-white/70" : "text-gray-400"
        }`}
      >
        {order.createdAt ? `от ${formatMoscowDate(order.createdAt)}` : ""}
      </p>
    </>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  direction,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  direction: "prev" | "next";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800 transition-colors active:scale-[0.97] active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
        {direction === "prev" ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        )}
      </svg>
    </button>
  );
}

export function OrderPicker({
  orders,
  currentIndex,
  statuses,
  onSelect,
  locked,
  visibleIndices,
}: OrderPickerProps) {
  const poolIndices = visibleIndices ?? orders.map((_, index) => index);

  const sortedIndices = useMemo(
    () =>
      getSortedOrderIndices(
        poolIndices.map((index) => orders[index]),
        poolIndices.map((index) => statuses[index]),
      ).map((sortedPos) => poolIndices[sortedPos]),
    [orders, statuses, poolIndices],
  );

  const positionInSorted = sortedIndices.indexOf(currentIndex);
  const currentOrder = orders[currentIndex];
  const pendingCount = orders.filter((o) => !o.barcodePrinted).length;

  const goPrev = () => {
    if (locked || sortedIndices.length === 0) return;
    const pos = positionInSorted >= 0 ? positionInSorted : 0;
    const prevPos = pos > 0 ? pos - 1 : sortedIndices.length - 1;
    onSelect(sortedIndices[prevPos]);
  };

  const goNext = () => {
    if (locked || sortedIndices.length === 0) return;
    const pos = positionInSorted >= 0 ? positionInSorted : 0;
    const nextPos = pos < sortedIndices.length - 1 ? pos + 1 : 0;
    onSelect(sortedIndices[nextPos]);
  };

  if (poolIndices.length === 0) {
    return (
      <p className="px-1 py-2 text-center text-sm text-gray-400">Все заказы отправлены</p>
    );
  }

  if (!currentOrder) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <NavButton label="Предыдущий заказ" onClick={goPrev} disabled={locked} direction="prev" />

        <div
          className={`relative min-h-12 min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-left ${tabClass(true)}`}
        >
          <OrderTabContent order={currentOrder} active />
        </div>

        <NavButton label="Следующий заказ" onClick={goNext} disabled={locked} direction="next" />
      </div>

      <div className="flex items-center justify-between gap-3 px-0.5">
        <p className="text-xs text-gray-500">
          {(positionInSorted >= 0 ? positionInSorted : 0) + 1} / {poolIndices.length}
          {pendingCount < orders.length && (
            <span className="ml-1.5 text-gray-400">· осталось {pendingCount}</span>
          )}
        </p>
      </div>
    </div>
  );
}
