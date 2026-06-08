"use client";

import { useMemo, useState } from "react";
import { formatOrderNumberShort } from "@/lib/format";
import { ORDER_STATUS_LABEL, type OrderDisplayStatus } from "@/lib/order-status";
import { getSortedOrderIndices } from "@/lib/order-sort";
import type { ShippingOrder } from "@/types/shipping";

const COMPACT_THRESHOLD = 12;

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
      <p className="w-full truncate text-xs font-semibold">
        {formatOrderNumberShort(order.orderNumber)}
      </p>
      <p className={`mt-0.5 line-clamp-2 w-full text-[10px] leading-tight ${subtextClass(status, active)}`}>
        {ORDER_STATUS_LABEL[status]}
      </p>
    </>
  );
}

function OrderTab({
  order,
  status,
  active,
  locked,
  onClick,
}: {
  order: ShippingOrder;
  status: OrderDisplayStatus;
  active: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked && !active}
      className={`relative flex h-14 w-[5.5rem] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition-all disabled:cursor-default ${tabClass(status, active)}`}
    >
      <OrderTabContent order={order} status={status} active={active} />
    </button>
  );
}

function CompactOrderPicker({
  orders,
  currentIndex,
  statuses,
  onSelect,
  sortedIndices,
  locked,
}: OrderPickerProps & { sortedIndices: number[] }) {
  const [search, setSearch] = useState("");
  const currentOrder = orders[currentIndex];
  const currentStatus = statuses[currentIndex];
  const pendingCount = orders.filter((o) => !o.barcodePrinted).length;

  const positionInSorted = sortedIndices.indexOf(currentIndex);

  const goPrev = () => {
    if (locked) return;
    const pos = positionInSorted >= 0 ? positionInSorted : 0;
    const prevPos = pos > 0 ? pos - 1 : sortedIndices.length - 1;
    onSelect(sortedIndices[prevPos]);
  };

  const goNext = () => {
    if (locked) return;
    const pos = positionInSorted >= 0 ? positionInSorted : 0;
    const nextPos = pos < sortedIndices.length - 1 ? pos + 1 : 0;
    onSelect(sortedIndices[nextPos]);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    const query = value.trim().toLowerCase();
    if (query.length < 2) return;

    const idx = orders.findIndex((order) => {
      const short = formatOrderNumberShort(order.orderNumber).toLowerCase();
      return (
        short.includes(query) ||
        order.orderNumber.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query)
      );
    });

    if (idx >= 0) onSelect(idx);
  };

  if (!currentOrder) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={locked}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 active:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Предыдущий заказ"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div
          className={`relative min-w-0 flex-1 rounded-xl border px-3 py-2 text-left ${tabClass(currentStatus, true)}`}
        >
          <OrderTabContent order={currentOrder} status={currentStatus} active />
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={locked}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 active:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Следующий заказ"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-gray-500">
          {(positionInSorted >= 0 ? positionInSorted : currentIndex) + 1} / {orders.length}
          {pendingCount < orders.length && (
            <span className="ml-1.5 text-gray-400">· осталось {pendingCount}</span>
          )}
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Поиск CSH…"
          className="h-8 w-36 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none sm:w-44"
        />
      </div>
    </div>
  );
}

export function OrderPicker(props: OrderPickerProps) {
  const { orders, currentIndex, statuses, onSelect, locked, visibleIndices } = props;

  const poolIndices = visibleIndices ?? orders.map((_, index) => index);

  const sortedIndices = useMemo(
    () => getSortedOrderIndices(
      poolIndices.map((index) => orders[index]),
      poolIndices.map((index) => statuses[index]),
    ).map((sortedPos) => poolIndices[sortedPos]),
    [orders, statuses, poolIndices],
  );

  if (poolIndices.length === 0) {
    return (
      <p className="px-1 py-2 text-center text-sm text-gray-400">Все заказы отправлены</p>
    );
  }

  if (poolIndices.length > COMPACT_THRESHOLD) {
    return <CompactOrderPicker {...props} sortedIndices={sortedIndices} />;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {sortedIndices.map((index) => (
        <OrderTab
          key={orders[index].id}
          order={orders[index]}
          status={statuses[index]}
          active={index === currentIndex}
          locked={locked}
          onClick={() => onSelect(index)}
        />
      ))}
    </div>
  );
}
