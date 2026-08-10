"use client";

import { useState, type ReactNode } from "react";
import { orderIsBlogger } from "@/lib/blogger-order";
import { resolveOrderUrgency, URGENCY_LABELS } from "@/lib/urgency";
import type { OrderUrgency, ShippingOrder } from "@/types/shipping";
import { KeyboardField } from "./VirtualKeyboard";

export type UrgencyFilter = "all" | OrderUrgency;
export type KindFilter = "all" | "blogger" | "regular";
export type ScanFilter = "all" | "unscanned" | "partial" | "ready";
export type CommentFilter = "all" | "with" | "without";

export interface OtpravkiFiltersState {
  urgency: UrgencyFilter;
  kind: KindFilter;
  scan: ScanFilter;
  comment: CommentFilter;
  city: string;
  query: string;
  /** Пустой = все товары; иначе заказ должен содержать хотя бы один выбранный */
  productIds: string[];
}

export interface FilterProductOption {
  productId: string;
  productName: string;
  orderCount: number;
  quantity: number;
}

export const DEFAULT_FILTERS: OtpravkiFiltersState = {
  urgency: "all",
  kind: "all",
  scan: "all",
  comment: "all",
  city: "all",
  query: "",
  productIds: [],
};

function orderScanState(order: ShippingOrder): Exclude<ScanFilter, "all"> {
  const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const scanned = order.items.reduce((sum, item) => sum + item.scannedCount, 0);
  if (scanned <= 0) return "unscanned";
  if (scanned >= total && total > 0) return "ready";
  return "partial";
}

function orderHasComments(order: ShippingOrder): boolean {
  if (order.customerComment?.trim()) return true;
  return Boolean(order.staffComments?.some((c) => c.body.trim()));
}

export function applyOrderFilters(
  orders: ShippingOrder[],
  filters: OtpravkiFiltersState,
): ShippingOrder[] {
  const q = filters.query.trim().toLowerCase();

  return orders.filter((order) => {
    if (order.barcodePrinted) {
      // archive list handled separately; keep printed out of active shipping filters
    }

    const urgency = resolveOrderUrgency(order);
    if (filters.urgency !== "all" && urgency !== filters.urgency) return false;

    if (filters.kind === "blogger" && !orderIsBlogger(order)) return false;
    if (filters.kind === "regular" && orderIsBlogger(order)) return false;

    if (filters.scan !== "all" && orderScanState(order) !== filters.scan) return false;

    if (filters.comment === "with" && !orderHasComments(order)) return false;
    if (filters.comment === "without" && orderHasComments(order)) return false;

    if (filters.city !== "all") {
      const city = order.city?.trim() || "";
      if (city !== filters.city) return false;
    }

    if (filters.productIds.length > 0) {
      const wanted = new Set(filters.productIds);
      if (!order.items.some((item) => wanted.has(item.productId))) return false;
    }

    if (q) {
      const hay = [
        order.orderNumber,
        order.customerName,
        order.city,
        order.trackingNumber,
        ...(order.tags?.map((t) => t.label) ?? []),
        ...order.items.map((item) => item.productName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

export function collectFilterCities(orders: ShippingOrder[]): string[] {
  const cities = new Set<string>();
  for (const order of orders) {
    const city = order.city?.trim();
    if (city && city !== "—" && city !== "-") cities.add(city);
  }
  return [...cities].sort((a, b) => a.localeCompare(b, "ru"));
}

/** Уникальные товары из заказов к отправке — для фильтра с выбором. */
export function collectFilterProducts(orders: ShippingOrder[]): FilterProductOption[] {
  const map = new Map<string, FilterProductOption>();
  for (const order of orders) {
    const seenInOrder = new Set<string>();
    for (const item of order.items) {
      const id = item.productId?.trim();
      if (!id) continue;
      const existing = map.get(id);
      if (!existing) {
        map.set(id, {
          productId: id,
          productName: item.productName?.trim() || id,
          orderCount: 1,
          quantity: item.quantity,
        });
        seenInOrder.add(id);
        continue;
      }
      existing.quantity += item.quantity;
      if (!seenInOrder.has(id)) {
        existing.orderCount += 1;
        seenInOrder.add(id);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.productName.localeCompare(b.productName, "ru"));
}

function toggleProductId(selected: string[], productId: string): string[] {
  return selected.includes(productId)
    ? selected.filter((id) => id !== productId)
    : [...selected, productId];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-700 active:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function FilterBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

interface OtpravkiFiltersPanelProps {
  filters: OtpravkiFiltersState;
  onChange: (next: OtpravkiFiltersState) => void;
  counts: {
    total: number;
    critical: number;
    rush: number;
    blogger: number;
    ready: number;
  };
  products?: FilterProductOption[];
}

export function OtpravkiFiltersPanel({
  filters,
  onChange,
  counts,
  products = [],
}: OtpravkiFiltersPanelProps) {
  const set = <K extends keyof OtpravkiFiltersState>(key: K, value: OtpravkiFiltersState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const selectedCount = filters.productIds.length;

  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:flex">
      <div>
        <p className="text-sm font-semibold text-gray-900">Фильтры</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {counts.total} заказов · {counts.ready} готовы
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Поиск
        </span>
        <KeyboardField
          value={filters.query}
          onChange={(next) => set("query", next)}
          placeholder="Номер, ФИО, город…"
          title="Поиск заказа"
          className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
        />
      </label>

      <FilterBlock title="Срочность">
        <Chip active={filters.urgency === "all"} onClick={() => set("urgency", "all")}>
          Все
        </Chip>
        {(["critical", "rush", "urgent", "high", "normal"] as const).map((key) => (
          <Chip key={key} active={filters.urgency === key} onClick={() => set("urgency", key)}>
            {URGENCY_LABELS[key].label}
            {key === "critical" ? ` (${counts.critical})` : ""}
            {key === "rush" ? ` (${counts.rush})` : ""}
          </Chip>
        ))}
      </FilterBlock>

      <FilterBlock title="Тип заказа">
        <Chip active={filters.kind === "all"} onClick={() => set("kind", "all")}>
          Все
        </Chip>
        <Chip active={filters.kind === "blogger"} onClick={() => set("kind", "blogger")}>
          Блогеры ({counts.blogger})
        </Chip>
        <Chip active={filters.kind === "regular"} onClick={() => set("kind", "regular")}>
          Обычные
        </Chip>
      </FilterBlock>

      {products.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Товар к отправке
            </p>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => set("productIds", [])}
                className="text-[10px] font-medium text-gray-500 underline-offset-2 hover:underline"
              >
                Сбросить ({selectedCount})
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400">
            {selectedCount === 0 ? "Все товары" : `Выбрано: ${selectedCount}`}
          </p>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto overscroll-contain pr-0.5">
            {products.map((product) => {
              const active = filters.productIds.includes(product.productId);
              return (
                <button
                  key={product.productId}
                  type="button"
                  onClick={() => set("productIds", toggleProductId(filters.productIds, product.productId))}
                  className={`rounded-lg px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-800 active:bg-gray-200"
                  }`}
                >
                  <span className="block text-xs font-medium leading-snug">{product.productName}</span>
                  <span className={`mt-0.5 block text-[10px] ${active ? "text-gray-300" : "text-gray-500"}`}>
                    {product.orderCount} зак. · {product.quantity} шт.
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_FILTERS })}
        className="mt-auto rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 active:bg-gray-50"
      >
        Сбросить фильтры
      </button>
    </aside>
  );
}

/** Компактные фильтры для мобилки */
export function OtpravkiMobileFilters({
  filters,
  onChange,
  products = [],
}: {
  filters: OtpravkiFiltersState;
  onChange: (next: OtpravkiFiltersState) => void;
  cities?: string[];
  products?: FilterProductOption[];
}) {
  const [productsOpen, setProductsOpen] = useState(false);
  const set = <K extends keyof OtpravkiFiltersState>(key: K, value: OtpravkiFiltersState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const selectedCount = filters.productIds.length;

  return (
    <div className="space-y-2 lg:hidden">
      <KeyboardField
        value={filters.query}
        onChange={(next) => set("query", next)}
        placeholder="Поиск заказа…"
        title="Поиск заказа"
        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
      />
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <select
          value={filters.urgency}
          onChange={(e) => set("urgency", e.target.value as UrgencyFilter)}
          className="h-9 shrink-0 rounded-xl border border-gray-200 bg-white px-2 text-xs"
        >
          <option value="all">Срочность: все</option>
          <option value="critical">Критический</option>
          <option value="rush">Срочно (тег)</option>
          <option value="urgent">Срочно</option>
          <option value="high">Высокий</option>
          <option value="normal">Обычный</option>
        </select>
        <select
          value={filters.kind}
          onChange={(e) => set("kind", e.target.value as KindFilter)}
          className="h-9 shrink-0 rounded-xl border border-gray-200 bg-white px-2 text-xs"
        >
          <option value="all">Тип: все</option>
          <option value="blogger">Блогеры</option>
          <option value="regular">Обычные</option>
        </select>
        {products.length > 0 && (
          <button
            type="button"
            onClick={() => setProductsOpen((v) => !v)}
            className={`h-9 shrink-0 rounded-xl border px-3 text-xs font-medium ${
              selectedCount > 0
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-800"
            }`}
          >
            Товар{selectedCount > 0 ? ` · ${selectedCount}` : ""}
          </button>
        )}
      </div>

      {productsOpen && products.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-900">Товары к отправке</p>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => set("productIds", [])}
                  className="text-[11px] font-medium text-gray-500"
                >
                  Сбросить
                </button>
              )}
              <button
                type="button"
                onClick={() => setProductsOpen(false)}
                className="rounded-lg bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white"
              >
                Готово
              </button>
            </div>
          </div>
          <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto overscroll-contain sm:grid-cols-2">
            {products.map((product) => {
              const active = filters.productIds.includes(product.productId);
              return (
                <button
                  key={product.productId}
                  type="button"
                  onClick={() => set("productIds", toggleProductId(filters.productIds, product.productId))}
                  className={`rounded-xl px-3 py-2 text-left ${
                    active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <span className="block text-xs font-medium leading-snug">{product.productName}</span>
                  <span className={`mt-0.5 block text-[10px] ${active ? "text-gray-300" : "text-gray-500"}`}>
                    {product.orderCount} зак. · {product.quantity} шт.
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
