"use client";

import { useMemo, useState } from "react";
import {
  ARCHIVE_STATUS_HINT,
  ARCHIVE_STATUS_LABEL,
  canUnshipFromArchive,
  getArchiveDeliveryStatus,
} from "@/lib/archive-status";
import { formatMoscowDateTime, formatOrderNumberShort } from "@/lib/format";
import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { ShippingOrder } from "@/types/shipping";

interface ArchiveViewProps {
  orders: ShippingOrder[];
  shippedArchive?: ShippingOrder[];
  apiOrderIds: string[];
  onUnship?: (orderId: string) => { ok: true } | { ok: false; error: string };
}

const STATUS_STYLES = {
  "in-transit": {
    card: "border-amber-200 bg-amber-50/80",
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-400",
  },
  delivered: {
    card: "border-gray-200 bg-gray-50/80",
    badge: "bg-gray-200 text-gray-600",
    dot: "bg-gray-400",
  },
} as const;

export function ArchiveView({ orders, shippedArchive, apiOrderIds, onUnship }: ArchiveViewProps) {
  const [unshipError, setUnshipError] = useState<string | null>(null);
  const [unshippingId, setUnshippingId] = useState<string | null>(null);
  const apiSet = useMemo(() => new Set(apiOrderIds), [apiOrderIds]);

  const shippedOrders = useMemo(
    () => mergeShippedArchives(shippedArchive ?? [], orders),
    [orders, shippedArchive],
  );

  const inTransitCount = shippedOrders.filter(
    (order) => getArchiveDeliveryStatus(order.id, apiSet) === "in-transit",
  ).length;

  if (shippedOrders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-12 text-center">
        <p className="text-sm font-medium text-gray-700">Архив пуст</p>
        <p className="mt-1 text-xs text-gray-500">Отправленные заказы появятся здесь после печати баркода</p>
      </div>
    );
  }

  const handleUnship = (order: ShippingOrder) => {
    if (!onUnship) return;

    const label = formatOrderNumberShort(order.orderNumber);
    if (
      !window.confirm(
        `Отменить отправку заказа ${label}? Он вернётся как новый — без сборки и без сканов.`,
      )
    ) {
      return;
    }

    setUnshipError(null);
    setUnshippingId(order.id);
    const result = onUnship(order.id);
    setUnshippingId(null);

    if (!result.ok) {
      setUnshipError(result.error);
    }
  };

  return (
    <div className="space-y-4">
      {unshipError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
          {unshipError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 px-0.5 text-xs text-gray-500">
        <span>{shippedOrders.length} отправлено</span>
        {inTransitCount > 0 && (
          <>
            <span className="text-gray-300">·</span>
            <span className="text-amber-700">{inTransitCount} в обработке</span>
          </>
        )}
        <span className="text-gray-300">·</span>
        <span>обновлено по API</span>
      </div>

      <div className="grid gap-2.5 sm:gap-3">
        {shippedOrders.map((order) => {
          const status = getArchiveDeliveryStatus(order.id, apiSet);
          const styles = STATUS_STYLES[status];
          const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

          return (
            <div
              key={order.id}
              className={`rounded-2xl border p-4 transition-colors ${styles.card}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatOrderNumberShort(order.orderNumber)}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11px] font-medium ${styles.badge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                      {ARCHIVE_STATUS_LABEL[status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{order.customerName}</p>
                  {order.city && <p className="text-xs text-gray-500">{order.city}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Отправлен
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-gray-600">
                    {order.barcodePrintedAt
                      ? formatMoscowDateTime(order.barcodePrintedAt)
                      : "—"}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-gray-600">
                {ARCHIVE_STATUS_HINT[status]}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="rounded-lg bg-white/70 px-2 py-1">
                  {itemCount} {itemCount === 1 ? "позиция" : "позиций"}
                </span>
                {order.trackingNumber && (
                  <span className="rounded-lg bg-white/70 px-2 py-1 font-mono">
                    {order.trackingNumber}
                  </span>
                )}
                {onUnship && canUnshipFromArchive(order.id, apiSet) && (
                  <button
                    type="button"
                    onClick={() => handleUnship(order)}
                    disabled={unshippingId === order.id}
                    className="ml-auto rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {unshippingId === order.id ? "Отмена…" : "Отменить отправку"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
