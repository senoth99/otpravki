"use client";

import { formatOrderNumberShort } from "@/lib/format";
import type { ShippingOrder } from "@/types/shipping";

interface ShippedArchiveProps {
  orders: ShippingOrder[];
  selectedId?: string | null;
  onSelect: (orderId: string) => void;
}

function ArchiveCard({
  order,
  selected,
  onClick,
}: {
  order: ShippingOrder;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-14 w-[5.5rem] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition-all ${
        selected
          ? "border-green-600 bg-green-600 text-white shadow-sm"
          : "border-green-200 bg-green-50 text-green-800"
      }`}
    >
      <p className="w-full truncate text-xs font-semibold">
        {formatOrderNumberShort(order.orderNumber)}
      </p>
      <p className={`mt-0.5 w-full text-[10px] leading-tight ${selected ? "text-white/70" : "text-green-600"}`}>
        Отправлен
      </p>
    </button>
  );
}

export function ShippedArchive({ orders, selectedId, onSelect }: ShippedArchiveProps) {
  if (orders.length === 0) return null;

  return (
    <div className="border-t border-green-100 pt-3">
      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-wide text-green-700/70">
        Архив отправок
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {orders.map((order) => (
          <ArchiveCard
            key={order.id}
            order={order}
            selected={selectedId === order.id}
            onClick={() => onSelect(order.id)}
          />
        ))}
      </div>
    </div>
  );
}
