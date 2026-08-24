"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { useLiveWorkspaceRefresh } from "@/hooks/useLiveWorkspaceRefresh";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { BloggerBadge } from "@/components/otpravki/BloggerBadge";
import { OrderComments } from "@/components/otpravki/OrderComments";
import { OrderNumberDisplay } from "@/components/otpravki/OrderNumberDisplay";
import { KeyboardField } from "@/components/otpravki/VirtualKeyboard";
import { formatMoscowDate, formatSize } from "@/lib/format";
import { PRODUCT_PLACEHOLDER_SRC, toLocalImageUrl } from "@/lib/image-url";
import { orderIsBlogger } from "@/lib/blogger-order";
import {
  buildOverviewStats,
  groupOrdersByProductId,
  groupProductsFromOrders,
  type OverviewProduct,
  type OverviewSize,
  type OverviewStats,
} from "@/lib/overview-data";
import { resolveOrderUrgency, URGENCY_LABELS } from "@/lib/urgency";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

function SizeChips({ sizes, compact }: { sizes: OverviewSize[]; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
      {sizes.map((row) => (
        <span
          key={row.size}
          className={`inline-flex items-baseline gap-0.5 rounded-lg bg-gray-100 font-medium text-gray-800 ${
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"
          }`}
        >
          {formatSize(row.size)}
          <span className="text-gray-400">×</span>
          {row.quantity}
        </span>
      ))}
    </div>
  );
}

function ProductThumb({ src, alt, className }: { src: string; alt: string; className: string }) {
  const url = toLocalImageUrl((src ?? "").trim());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const showPlaceholder = !url || failed;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={showPlaceholder ? PRODUCT_PLACEHOLDER_SRC : url}
      alt={alt}
      className={`object-cover ${className}`}
      draggable={false}
      onError={() => {
        if (!showPlaceholder) setFailed(true);
      }}
    />
  );
}

function linesForProduct(order: ShippingOrder, productId: string) {
  return order.items.filter((item) => item.productId === productId);
}

function OrderSublist({
  productId,
  orders,
  onOrderClick,
}: {
  productId: string;
  orders: ShippingOrder[];
  onOrderClick: (order: ShippingOrder) => void;
}) {
  if (orders.length === 0) {
    return <p className="px-3 py-3 text-sm text-gray-500">Нет заказов с этой моделью</p>;
  }

  return (
    <ul className="space-y-1 p-2">
      {orders.map((order) => {
        const urgency = URGENCY_LABELS[resolveOrderUrgency(order)];
        const lines = linesForProduct(order, productId);
        return (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onOrderClick(order)}
              className="flex w-full items-start justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-gray-100 active:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  <OrderNumberDisplay orderNumber={order.orderNumber} />
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {order.customerName}
                  {order.city ? ` · ${order.city}` : ""}
                </p>
                <div className="mt-1.5">
                  <SizeChips
                    sizes={lines.map((line) => ({
                      size: line.size,
                      quantity: line.quantity,
                    }))}
                    compact
                  />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${urgency.className}`}
                >
                  {urgency.label}
                </span>
                {order.ready === false ? (
                  <span className="text-[10px] font-medium text-red-600">Нет товара</span>
                ) : null}
                {orderIsBlogger(order) ? <BloggerBadge /> : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OrderPeekPopup({
  order,
  onClose,
}: {
  order: ShippingOrder;
  onClose: () => void;
}) {
  const urgency = URGENCY_LABELS[resolveOrderUrgency(order)];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="overview-order-title"
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-gray-100 px-5 pb-4 pt-5 pr-14">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none text-gray-400 active:bg-gray-100 active:text-gray-900"
          >
            ×
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="overview-order-title" className="text-lg font-semibold text-gray-900">
              <OrderNumberDisplay orderNumber={order.orderNumber} />
            </h2>
            <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${urgency.className}`}>
              {urgency.label}
            </span>
            {orderIsBlogger(order) ? <BloggerBadge /> : null}
          </div>
          <p className="mt-1 text-sm text-gray-600">{order.customerName}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {[order.city, order.createdAt ? formatMoscowDate(order.createdAt) : null, order.deadline]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {order.trackingNumber ? (
            <p className="mt-1 text-xs text-gray-500">Трек · {order.trackingNumber}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain p-4 space-y-3">
          {order.ready === false ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              Не готов к отправке
              {order.missingItems?.length ? (
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {order.missingItems.map((item) => (
                    <li key={`${item.productName}-${item.size}`}>
                      {item.productName} · {formatSize(item.size)} × {item.quantity}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <ul className="space-y-2">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 px-3 py-2"
              >
                <ProductThumb
                  src={item.imageUrl}
                  alt={item.productName}
                  className="h-12 w-12 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{item.productName}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatSize(item.size)} × {item.quantity}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {order.tags?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {order.tags.map((tag) => (
                <span
                  key={tag.label}
                  className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                >
                  {tag.label}
                </span>
              ))}
            </div>
          ) : null}

          <OrderComments order={order} />
        </div>
      </div>
    </div>
  );
}

function ProductOrdersPopup({
  product,
  orders,
  onClose,
  onOrderClick,
  closeOnEscape,
}: {
  product: OverviewProduct;
  orders: ShippingOrder[];
  onClose: () => void;
  onOrderClick: (order: ShippingOrder) => void;
  closeOnEscape: boolean;
}) {
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeOnEscape, onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="overview-product-orders-title"
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-gray-100 px-5 pb-4 pt-5 pr-14">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none text-gray-400 active:bg-gray-100 active:text-gray-900"
          >
            ×
          </button>
          <div className="flex items-start gap-3">
            <ProductThumb
              src={product.imageUrl}
              alt={product.productName}
              className="h-14 w-14 shrink-0 rounded-2xl"
            />
            <div className="min-w-0">
              <h2
                id="overview-product-orders-title"
                className="text-base font-semibold leading-snug text-gray-900"
              >
                {product.productName}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {orders.length} {orders.length === 1 ? "заказ" : "заказов"}
              </p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain bg-gray-50">
          <OrderSublist
            productId={product.productId}
            orders={orders}
            onOrderClick={onOrderClick}
          />
        </div>
      </div>
    </div>
  );
}

function TileCard({
  product,
  orders,
  onOpen,
}: {
  product: OverviewProduct;
  orders: ShippingOrder[];
  onOpen: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left active:bg-gray-50">
        <ProductThumb
          src={product.imageUrl}
          alt={product.productName}
          className="aspect-square w-full"
        />
        <div className="px-2.5 py-2">
          <p className="mb-1.5 line-clamp-2 text-xs font-medium leading-snug text-gray-900">
            {product.productName}
          </p>
          <SizeChips sizes={product.sizes} compact />
          <p className="mt-1.5 text-[11px] text-gray-400">
            {orders.length} {orders.length === 1 ? "заказ" : "заказов"}
          </p>
        </div>
      </button>
    </article>
  );
}

function ListRow({
  product,
  orders,
  expanded,
  onToggle,
  onOrderClick,
}: {
  product: OverviewProduct;
  orders: ShippingOrder[];
  expanded: boolean;
  onToggle: () => void;
  onOrderClick: (order: ShippingOrder) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-gray-50"
      >
        <ProductThumb
          src={product.imageUrl}
          alt={product.productName}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{product.productName}</p>
          <div className="mt-1">
            <SizeChips sizes={product.sizes} compact />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] tabular-nums text-gray-400">{orders.length}</span>
          <span
            className={`text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-gray-100 bg-gray-50">
          <OrderSublist productId={product.productId} orders={orders} onOrderClick={onOrderClick} />
        </div>
      ) : null}
    </article>
  );
}

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p
        className={`mt-1 text-3xl font-bold tabular-nums ${
          warn && value > 0 ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function statsList(stats: OverviewStats) {
  return [
    { label: "Заказов", value: stats.orders },
    { label: "Единиц", value: stats.units },
    { label: "Моделей", value: stats.models },
    { label: "Критические", value: stats.critical, warn: true },
    { label: "Срочно", value: stats.rush, warn: true },
    { label: "Блогеры", value: stats.blogger },
    { label: "Нет товара", value: stats.notReady, warn: true },
    { label: "Сегодня ушло", value: stats.shippedToday },
  ];
}

export function OverviewPanel({
  assemblyItems: initialAssembly,
  orders: initialOrders,
  shippedArchive: initialArchive = [],
}: {
  assemblyItems: AssemblyItem[];
  orders: ShippingOrder[];
  shippedArchive?: ShippingOrder[];
}) {
  useOtpravkiNoSwipe();
  const [assemblyItems, setAssemblyItems] = useState(initialAssembly);
  const [orders, setOrders] = useState(initialOrders);
  const [shippedArchive, setShippedArchive] = useState(initialArchive);
  const [view, setView] = useState<"tiles" | "list">("tiles");
  const [query, setQuery] = useState("");
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [tileProduct, setTileProduct] = useState<OverviewProduct | null>(null);
  const [openOrder, setOpenOrder] = useState<ShippingOrder | null>(null);

  const applyWorkspace = useCallback((workspace: SharedWorkspaceState) => {
    setAssemblyItems(workspace.assemblyItems);
    setOrders(workspace.orders);
    setShippedArchive(workspace.shippedArchive ?? []);
  }, []);

  const { onUserAction } = useLiveWorkspaceRefresh(applyWorkspace, {
    enabled: !USE_MOCK_ORDERS,
  });

  const products = useMemo(() => groupProductsFromOrders(orders), [orders]);
  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || view !== "list") return products;
    return products.filter((product) => {
      const hay = [
        product.productName,
        product.productId,
        product.brand,
        ...product.sizes.map((row) => `${row.size} ${row.quantity}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, view]);
  const ordersByProduct = useMemo(() => groupOrdersByProductId(orders), [orders]);
  const stats = useMemo(
    () => buildOverviewStats(assemblyItems, orders, shippedArchive),
    [assemblyItems, orders, shippedArchive],
  );

  const toggleProduct = (productId: string) => {
    setOpenProductId((current) => (current === productId ? null : productId));
  };

  return (
    <div className="otpravki-shell min-h-dvh bg-gray-50">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statsList(stats).map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} warn={card.warn} />
          ))}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-500">
              К отправке ·{" "}
              {view === "list" && query.trim()
                ? `${visibleProducts.length} из ${products.length}`
                : products.length}{" "}
              {products.length === 1 ? "модель" : "моделей"}
            </p>
            <div className="flex rounded-2xl border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => {
                  setView("tiles");
                  setOpenProductId(null);
                  onUserAction();
                }}
                className={`inline-flex h-9 cursor-pointer items-center rounded-xl px-3 text-sm font-medium ${
                  view === "tiles" ? "bg-gray-900 text-white" : "text-gray-700"
                }`}
              >
                Плитки
              </button>
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setTileProduct(null);
                  setOpenOrder(null);
                  onUserAction();
                }}
                className={`inline-flex h-9 cursor-pointer items-center rounded-xl px-3 text-sm font-medium ${
                  view === "list" ? "bg-gray-900 text-white" : "text-gray-700"
                }`}
              >
                Список
              </button>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-4 py-16 text-center text-sm text-gray-500">
              Пока нечего отправлять
            </div>
          ) : view === "tiles" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {products.map((product) => (
                <TileCard
                  key={product.productId}
                  product={product}
                  orders={ordersByProduct.get(product.productId) ?? []}
                  onOpen={() => {
                    setTileProduct(product);
                    onUserAction();
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <KeyboardField
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  onUserAction();
                }}
                debounceMs={250}
                placeholder="Поиск модели…"
                title="Поиск модели"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 shadow-sm"
              />
              {visibleProducts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
                  Ничего не найдено
                </div>
              ) : (
                visibleProducts.map((product) => (
                  <ListRow
                    key={product.productId}
                    product={product}
                    orders={ordersByProduct.get(product.productId) ?? []}
                    expanded={openProductId === product.productId}
                    onToggle={() => {
                      toggleProduct(product.productId);
                      onUserAction();
                    }}
                    onOrderClick={(order) => {
                      setOpenOrder(order);
                      onUserAction();
                    }}
                  />
                ))
              )}
            </div>
          )}
        </section>
      </div>
      {tileProduct ? (
        <ProductOrdersPopup
          product={tileProduct}
          orders={ordersByProduct.get(tileProduct.productId) ?? []}
          onClose={() => {
            setOpenOrder(null);
            setTileProduct(null);
          }}
          onOrderClick={(order) => {
            setOpenOrder(order);
            onUserAction();
          }}
          closeOnEscape={!openOrder}
        />
      ) : null}
      {openOrder ? <OrderPeekPopup order={openOrder} onClose={() => setOpenOrder(null)} /> : null}
    </div>
  );
}
