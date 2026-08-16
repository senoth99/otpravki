"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoscowDate, formatOrderNumberShort } from "@/lib/format";
import { type OrderDisplayStatus } from "@/lib/order-status";
import { getSortedOrderIndices } from "@/lib/order-sort";
import type { ShippingOrder } from "@/types/shipping";
import { KeyboardField } from "./VirtualKeyboard";

interface OrderPickerProps {
  orders: ShippingOrder[];
  currentIndex: number;
  statuses: OrderDisplayStatus[];
  onSelect: (index: number) => void;
  locked?: boolean;
  /** Индексы заказов, видимых в пикере (по умолчанию — все) */
  visibleIndices?: number[];
}

function tabClass(status: OrderDisplayStatus, active: boolean): string {
  if (active) {
    switch (status) {
      case "shipped":
        return "border-green-600 bg-green-600 text-white shadow-sm";
      case "assembled":
      case "ready-to-ship":
        return "border-gray-900 bg-gray-900 text-white shadow-sm";
      default:
        return "border-gray-300 bg-gray-100 text-gray-700";
    }
  }

  switch (status) {
    case "shipped":
      return "border-green-200 bg-green-50 text-green-800";
    case "assembled":
    case "ready-to-ship":
      return "border-gray-200 bg-white text-gray-900";
    default:
      return "border-gray-200 bg-gray-50 text-gray-400";
  }
}

function subtextClass(status: OrderDisplayStatus, active: boolean): string {
  if (active && status !== "awaiting-assembly") return "text-white/70";
  if (active) return "text-gray-500";
  if (status === "shipped") return "text-green-600";
  return "text-gray-400";
}

function OrderTabContent({
  order,
  status,
  active,
}: {
  order: ShippingOrder;
  status: OrderDisplayStatus;
  active: boolean;
}) {
  return (
    <>
      <p className="w-full truncate text-sm font-semibold leading-tight">
        {formatOrderNumberShort(order.orderNumber)}
      </p>
      <p className={`mt-0.5 w-full truncate text-[11px] leading-tight ${subtextClass(status, active)}`}>
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
  const [search, setSearch] = useState("");
  const stripRef = useRef<HTMLDivElement>(null);
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
  const currentStatus = statuses[currentIndex];
  const pendingCount = orders.filter((o) => !o.barcodePrinted).length;
  const showStrip = poolIndices.length > 0 && poolIndices.length <= 16;

  useEffect(() => {
    if (!showStrip || !stripRef.current) return;
    const active = stripRef.current.querySelector<HTMLElement>("[data-active-order='true']");
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentIndex, showStrip, sortedIndices]);

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

  const handleSearch = (value: string) => {
    setSearch(value);
    const query = value.trim().toLowerCase();
    if (query.length < 2) return;

    const matchedIndex = poolIndices.find((index) => {
      const order = orders[index];
      const short = formatOrderNumberShort(order.orderNumber).toLowerCase();
      return (
        short.includes(query) ||
        order.orderNumber.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query)
      );
    });

    if (matchedIndex !== undefined) onSelect(matchedIndex);
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
          className={`relative min-h-12 min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-left ${tabClass(currentStatus, true)}`}
        >
          <OrderTabContent order={currentOrder} status={currentStatus} active />
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
        <KeyboardField
          value={search}
          onChange={handleSearch}
          placeholder="Поиск CSH…"
          disabled={locked}
          title="Поиск заказа"
          className="h-11 w-40 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:w-48"
        />
      </div>

      {showStrip && (
        <div
          ref={stripRef}
          className="touch-pan-x flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sortedIndices.map((index) => {
            const active = index === currentIndex;
            return (
              <button
                key={orders[index].id}
                type="button"
                data-active-order={active ? "true" : undefined}
                onClick={() => onSelect(index)}
                disabled={locked && !active}
                className={`relative flex h-14 w-[6.25rem] shrink-0 snap-start flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition-all active:scale-[0.98] disabled:cursor-default ${tabClass(statuses[index], active)}`}
              >
                <OrderTabContent
                  order={orders[index]}
                  status={statuses[index]}
                  active={active}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
