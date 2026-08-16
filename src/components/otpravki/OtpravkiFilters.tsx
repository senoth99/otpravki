"use client";

import { useEffect, useState, type ReactNode } from "react";
import { orderIsBlogger } from "@/lib/blogger-order";
import { resolveOrderUrgency, URGENCY_LABELS } from "@/lib/urgency";
import type { OrderUrgency, ShippingOrder } from "@/types/shipping";
import { ProductImage } from "./ProductImage";
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
  imageUrl: string;
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
        order.shippedByEmoji,
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
      const imageUrl = item.imageUrl?.trim() || existing?.imageUrl || "";
      if (!existing) {
        map.set(id, {
          productId: id,
          productName: item.productName?.trim() || id,
          imageUrl,
          orderCount: 1,
          quantity: item.quantity,
        });
        seenInOrder.add(id);
        continue;
      }
      if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
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

function ProductFilterModal({
  open,
  onClose,
  products,
  selectedIds,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  products: FilterProductOption[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (open) setDraft(selectedIds);
  }, [open, selectedIds]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:max-w-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="font-semibold text-gray-900">Фильтр по вещам</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {draft.length === 0
              ? "Показаны все заказы"
              : `Выбрано: ${draft.length} · заказы с этими позициями`}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {products.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">Нет товаров к отправке</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {products.map((product) => {
                const active = draft.includes(product.productId);
                return (
                  <button
                    key={product.productId}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => toggleProductId(prev, product.productId))
                    }
                    className={`overflow-hidden rounded-xl border text-left transition-colors ${
                      active
                        ? "border-gray-900 bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1"
                        : "border-gray-200 bg-white active:bg-gray-50"
                    }`}
                  >
                    <div className="relative aspect-square w-full bg-gray-100">
                      <ProductImage
                        src={product.imageUrl}
                        alt={product.productName}
                        className="object-cover"
                        sizes="(max-width: 640px) 45vw, 180px"
                      />
                      {active && (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-900 shadow">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs font-medium leading-snug">
                        {product.productName}
                      </p>
                      <p
                        className={`mt-1 text-[10px] ${active ? "text-gray-300" : "text-gray-500"}`}
                      >
                        {product.orderCount} зак. · {product.quantity} шт.
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-100 p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setDraft([])}
            className="min-h-12 flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 active:bg-gray-50"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(draft);
              onClose();
            }}
            className="min-h-12 flex-1 rounded-xl bg-gray-900 py-3 text-sm font-medium text-white active:bg-gray-800"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductFilterButton({
  selectedCount,
  onClick,
  className = "",
}: {
  selectedCount: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] ${
        selectedCount > 0
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-800 active:bg-gray-50"
      } ${className}`}
    >
      Вещи
      {selectedCount > 0 ? ` · ${selectedCount}` : ""}
    </button>
  );
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
      className={`min-h-11 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors active:scale-[0.98] ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-700 active:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function BrandFilter({
  brands,
  selected,
  onChange,
  disabled,
}: {
  brands: readonly string[];
  selected: string;
  onChange: (brand: string) => void;
  disabled?: boolean;
}) {
  if (brands.length === 0) return null;

  const selectBrand = (brand: string) => {
    // Ровно один бренд: клик по уже выбранному ничего не сбрасывает
    if (brand === selected) return;
    onChange(brand);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Бренд</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Бренд">
        {brands.map((brand) => {
          const active = brand === selected;
          return (
            <button
              key={brand}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => selectBrand(brand)}
              disabled={disabled}
              className={`min-h-11 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-60 ${
                active
                  ? "cursor-default bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 active:bg-gray-200"
              }`}
            >
              {brand}
            </button>
          );
        })}
      </div>
    </div>
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
  brandOptions?: readonly string[];
  selectedBrand?: string;
  onBrandChange?: (brand: string) => void;
  brandDisabled?: boolean;
  brandOnly?: boolean;
}

export function OtpravkiFiltersPanel({
  filters,
  onChange,
  counts,
  products = [],
  brandOptions = [],
  selectedBrand,
  onBrandChange,
  brandDisabled,
  brandOnly = false,
}: OtpravkiFiltersPanelProps) {
  const [productsOpen, setProductsOpen] = useState(false);
  const set = <K extends keyof OtpravkiFiltersState>(key: K, value: OtpravkiFiltersState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const selectedCount = filters.productIds.length;
  const brand =
    selectedBrand && brandOptions.includes(selectedBrand)
      ? selectedBrand
      : brandOptions[0] ?? "";

  return (
    <>
      <aside className="hidden h-full w-56 shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:flex">
      <div>
        <p className="text-sm font-semibold text-gray-900">{brandOnly ? "Архив" : "Фильтры"}</p>
        {!brandOnly && (
          <p className="mt-0.5 text-[11px] text-gray-500">
            {counts.total} заказов · {counts.ready} готовы
          </p>
        )}
      </div>

      {brandOptions.length > 0 && onBrandChange && brand && (
        <BrandFilter
          brands={brandOptions}
          selected={brand}
          onChange={onBrandChange}
          disabled={brandDisabled}
        />
      )}

      {!brandOnly && (
        <>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Поиск
            </span>
            <KeyboardField
              value={filters.query}
              onChange={(next) => set("query", next)}
              placeholder="Номер, ФИО, город…"
              title="Поиск заказа"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
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
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Вещи</p>
              <ProductFilterButton
                selectedCount={selectedCount}
                onClick={() => setProductsOpen(true)}
                className="w-full py-3"
              />
              <p className="text-[10px] text-gray-400">
                {selectedCount === 0 ? "Все товары" : `Фильтр: ${selectedCount} поз.`}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="mt-auto min-h-11 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-50"
          >
            Сбросить фильтры
          </button>
        </>
      )}
    </aside>

      <ProductFilterModal
        open={productsOpen}
        onClose={() => setProductsOpen(false)}
        products={products}
        selectedIds={filters.productIds}
        onConfirm={(productIds) => onChange({ ...filters, productIds })}
      />
    </>
  );
}

/** Компактные фильтры для мобилки / сенсорного монитора */
export function OtpravkiMobileFilters({
  filters,
  onChange,
  products = [],
  brandOptions = [],
  selectedBrand,
  onBrandChange,
  brandDisabled,
  brandOnly = false,
}: {
  filters: OtpravkiFiltersState;
  onChange: (next: OtpravkiFiltersState) => void;
  cities?: string[];
  products?: FilterProductOption[];
  brandOptions?: readonly string[];
  selectedBrand?: string;
  onBrandChange?: (brand: string) => void;
  brandDisabled?: boolean;
  /** Только выбор бренда (архив) */
  brandOnly?: boolean;
}) {
  const [productsOpen, setProductsOpen] = useState(false);
  const set = <K extends keyof OtpravkiFiltersState>(key: K, value: OtpravkiFiltersState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const selectedCount = filters.productIds.length;
  const brand =
    selectedBrand && brandOptions.includes(selectedBrand)
      ? selectedBrand
      : brandOptions[0] ?? "";

  return (
    <div className="space-y-3 lg:hidden">
      {brandOptions.length > 0 && onBrandChange && brand && (
        <BrandFilter
          brands={brandOptions}
          selected={brand}
          onChange={onBrandChange}
          disabled={brandDisabled}
        />
      )}

      {!brandOnly && (
        <>
          <KeyboardField
            value={filters.query}
            onChange={(next) => set("query", next)}
            placeholder="Поиск заказа…"
            title="Поиск заказа"
            className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Срочность
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip active={filters.urgency === "all"} onClick={() => set("urgency", "all")}>
                Все
              </Chip>
              {(["critical", "rush", "urgent", "high", "normal"] as const).map((key) => (
                <Chip
                  key={key}
                  active={filters.urgency === key}
                  onClick={() => set("urgency", key)}
                >
                  {URGENCY_LABELS[key].label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Тип</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={filters.kind === "all"} onClick={() => set("kind", "all")}>
                Все
              </Chip>
              <Chip active={filters.kind === "blogger"} onClick={() => set("kind", "blogger")}>
                Блогеры
              </Chip>
              <Chip active={filters.kind === "regular"} onClick={() => set("kind", "regular")}>
                Обычные
              </Chip>
              {products.length > 0 && (
                <ProductFilterButton
                  selectedCount={selectedCount}
                  onClick={() => setProductsOpen(true)}
                />
              )}
            </div>
          </div>

          <ProductFilterModal
            open={productsOpen}
            onClose={() => setProductsOpen(false)}
            products={products}
            selectedIds={filters.productIds}
            onConfirm={(productIds) => onChange({ ...filters, productIds })}
          />
        </>
      )}
    </div>
  );
}
