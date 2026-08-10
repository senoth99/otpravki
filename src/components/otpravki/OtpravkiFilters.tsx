"use client";

import type { ReactNode } from "react";
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
}

export const DEFAULT_FILTERS: OtpravkiFiltersState = {
  urgency: "all",
  kind: "all",
  scan: "all",
  comment: "all",
  city: "all",
  query: "",
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

    if (q) {
      const hay = [
        order.orderNumber,
        order.customerName,
        order.city,
        order.trackingNumber,
        ...(order.tags?.map((t) => t.label) ?? []),
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
}

export function OtpravkiFiltersPanel({
  filters,
  onChange,
  counts,
}: OtpravkiFiltersPanelProps) {
  const set = <K extends keyof OtpravkiFiltersState>(key: K, value: OtpravkiFiltersState[K]) => {
    onChange({ ...filters, [key]: value });
  };

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
}: {
  filters: OtpravkiFiltersState;
  onChange: (next: OtpravkiFiltersState) => void;
  cities?: string[];
}) {
  const set = <K extends keyof OtpravkiFiltersState>(key: K, value: OtpravkiFiltersState[K]) => {
    onChange({ ...filters, [key]: value });
  };

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
      </div>
    </div>
  );
}
