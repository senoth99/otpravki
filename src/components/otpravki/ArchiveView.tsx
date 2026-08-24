"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ARCHIVE_STATUS_HINT,
  ARCHIVE_STATUS_LABEL,
  canUnshipFromArchive,
  getArchiveDeliveryStatus,
} from "@/lib/archive-status";
import { formatMoscowDateTime, formatSize } from "@/lib/format";
import { printOrderBarcode } from "@/lib/print-barcode";
import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { ShippingOrder } from "@/types/shipping";
import { OrderNumberDisplay } from "./OrderNumberDisplay";
import { ProductImage } from "./ProductImage";

interface ArchiveViewProps {
  orders: ShippingOrder[];
  shippedArchive?: ShippingOrder[];
  apiOrderIds: string[];
  onUnship?: (
    orderId: string,
  ) =>
    | { ok: true }
    | { ok: false; error: string }
    | Promise<{ ok: true } | { ok: false; error: string }>;
  /** Гость: только просмотр, без отмены/перепечати */
  readOnly?: boolean;
  onRequestLogin?: () => void;
  query?: string;
  onQueryChange?: (query: string) => void;
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

/** Сколько карточек рисовать за раз — иначе Chrome OOM на архиве. */
const ARCHIVE_PAGE_SIZE = 40;

function matchesArchiveQuery(order: ShippingOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    order.orderNumber,
    order.customerName,
    order.city,
    order.trackingNumber,
    order.shippedByEmoji,
    ...(order.tags?.map((t) => t.label) ?? []),
    ...order.items.map((item) => `${item.productName} ${item.size}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function ArchiveView({
  orders,
  shippedArchive,
  apiOrderIds,
  onUnship,
  readOnly = false,
  onRequestLogin,
  query = "",
  onQueryChange,
}: ArchiveViewProps) {
  const [unshipError, setUnshipError] = useState<string | null>(null);
  const [unshippingId, setUnshippingId] = useState<string | null>(null);
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [reprintError, setReprintError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ARCHIVE_PAGE_SIZE);
  const apiSet = useMemo(() => new Set(apiOrderIds), [apiOrderIds]);

  const allShipped = useMemo(
    () => mergeShippedArchives(shippedArchive ?? [], orders),
    [orders, shippedArchive],
  );

  const shippedOrders = useMemo(
    () => allShipped.filter((order) => matchesArchiveQuery(order, query)),
    [allShipped, query],
  );

  useEffect(() => {
    setVisibleCount(ARCHIVE_PAGE_SIZE);
  }, [query]);

  const visibleOrders = useMemo(
    () => shippedOrders.slice(0, visibleCount),
    [shippedOrders, visibleCount],
  );
  const hasMore = visibleOrders.length < shippedOrders.length;

  const inTransitCount = shippedOrders.filter(
    (order) => getArchiveDeliveryStatus(order.id, apiSet) === "in-transit",
  ).length;

  const handleUnship = async (order: ShippingOrder) => {
    if (readOnly) {
      onRequestLogin?.();
      return;
    }
    if (!onUnship) return;

    const label = order.orderNumber;
    if (
      !window.confirm(
        `Отменить отправку заказа ${label}? Он вернётся как новый — без сборки и без сканов.`,
      )
    ) {
      return;
    }

    setUnshipError(null);
    setUnshippingId(order.id);
    try {
      const result = await onUnship(order.id);
      if (!result.ok) {
        setUnshipError(result.error);
      }
    } finally {
      setUnshippingId(null);
    }
  };

  const handleReprint = async (order: ShippingOrder) => {
    if (readOnly) {
      onRequestLogin?.();
      return;
    }
    if (reprintingId) return;
    setReprintError(null);
    setReprintingId(order.id);
    const result = await printOrderBarcode(order.orderNumber, {
      orderId: order.id,
      barcodeUrl: order.barcodeUrl,
      order,
    });
    setReprintingId(null);
    if (!result.ok) {
      setReprintError(result.message ?? `Не удалось перепечатать ${order.orderNumber}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 px-0.5 text-xs text-gray-500">
        <span>
          {query.trim()
            ? `${shippedOrders.length} из ${allShipped.length}`
            : `${allShipped.length} отправлено`}
        </span>
        {inTransitCount > 0 && (
          <>
            <span className="text-gray-300">·</span>
            <span className="text-amber-700">{inTransitCount} в обработке</span>
          </>
        )}
      </div>

      {(unshipError || reprintError) && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
          {unshipError ?? reprintError}
        </p>
      )}

      {allShipped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-12 text-center">
          <p className="text-sm font-medium text-gray-700">Архив пуст</p>
          <p className="mt-1 text-xs text-gray-500">
            Отправленные заказы появятся здесь после печати баркода
          </p>
        </div>
      ) : shippedOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">Ничего не найдено</p>
          <p className="mt-1 text-xs text-gray-500">Измени запрос или сбрось поиск</p>
          {onQueryChange ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 active:bg-gray-50"
            >
              Сбросить поиск
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:gap-3">
          {visibleOrders.map((order) => {
            const status = getArchiveDeliveryStatus(order.id, apiSet);
            const styles = STATUS_STYLES[status];
            const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const isReprinting = reprintingId === order.id;

            return (
              <div
                key={order.id}
                className={`rounded-2xl border p-4 transition-colors ${styles.card}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        <OrderNumberDisplay orderNumber={order.orderNumber} />
                      </p>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11px] font-medium ${styles.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                        {ARCHIVE_STATUS_LABEL[status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{order.customerName}</p>
                    {order.city && order.city !== "—" && order.city !== "-" && (
                      <p className="text-xs text-gray-500">{order.city}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      Отправил
                    </p>
                    <p className="mt-0.5 flex items-center justify-end gap-1.5 text-sm text-gray-800">
                      {order.shippedByEmoji ? (
                        <>
                          <span className="text-lg leading-none">{order.shippedByEmoji}</span>
                          <span className="text-xs tabular-nums text-gray-500">
                            {order.barcodePrintedAt
                              ? formatMoscowDateTime(order.barcodePrintedAt)
                              : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs tabular-nums text-gray-600">
                          {order.barcodePrintedAt
                            ? formatMoscowDateTime(order.barcodePrintedAt)
                            : "—"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2.5">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        <ProductImage
                          src={item.imageUrl}
                          alt={item.productName}
                          productName={item.productName}
                          className="object-cover"
                          sizes="40px"
                          previewable={false}
                        />
                        {item.quantity > 1 && (
                          <div className="absolute left-0.5 top-0.5 rounded bg-gray-900 px-0.5 py-0.5 text-[9px] font-bold leading-none text-white">
                            ×{item.quantity}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-800">
                          {item.productName}
                        </p>
                        <p className="text-[11px] text-gray-500">{formatSize(item.size)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="rounded-lg bg-white/70 px-2 py-1">
                    {itemCount} {itemCount === 1 ? "позиция" : "позиций"}
                  </span>
                  {order.trackingNumber && (
                    <span className="rounded-lg bg-white/70 px-2 py-1 font-mono">
                      {order.trackingNumber}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleReprint(order)}
                      disabled={!readOnly && Boolean(reprintingId)}
                      className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 active:bg-gray-50 disabled:opacity-50"
                    >
                      {isReprinting ? "Печать…" : "Перепечатать трек"}
                    </button>
                    {onUnship && canUnshipFromArchive(order.id, apiSet) && (
                      <button
                        type="button"
                        onClick={() => handleUnship(order)}
                        disabled={!readOnly && unshippingId === order.id}
                        className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 active:bg-amber-50 disabled:opacity-50"
                      >
                        {unshippingId === order.id ? "Отмена…" : "Отменить отправку"}
                      </button>
                    )}
                  </div>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  {ARCHIVE_STATUS_HINT[status]}
                </p>
              </div>
            );
          })}

          {hasMore ? (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + ARCHIVE_PAGE_SIZE)}
              className="min-h-12 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 active:bg-gray-50"
            >
              Показать ещё · {shippedOrders.length - visibleOrders.length} скрыто
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
