"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ALL_BRANDS, formatBrandLabel } from "@/lib/store-brand";
import { orderIsBlogger } from "@/lib/blogger-order";
import { noteClientAction } from "@/lib/client-diag";
import { isRushUrgency, resolveOrderUrgency, URGENCY_LABELS } from "@/lib/urgency";
import type { OrderUrgency, ShippingOrder } from "@/types/shipping";
import { AdminPinPopup } from "@/components/admin/AdminPinPopup";
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
  /** true (по умолчанию) — только заказы готовые к отправке (всё в наличии) */
  inStock: boolean;
  /** true (по умолчанию) — только заказы, собранные в приложении сборки */
  fromAssembly: boolean;
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
  inStock: true,
  fromAssembly: true,
};

const URGENCY_KEYS = ["critical", "rush", "high", "normal"] as const;

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
  extras?: { assembledOrderIds?: ReadonlySet<string> },
): ShippingOrder[] {
  const q = filters.query.trim().toLowerCase();
  const assembledOrderIds = extras?.assembledOrderIds;

  return orders.filter((order) => {
    const urgency = resolveOrderUrgency(order);
    if (filters.urgency !== "all") {
      if (filters.urgency === "rush" || filters.urgency === "urgent") {
        if (!isRushUrgency(urgency)) return false;
      } else if (urgency !== filters.urgency) {
        return false;
      }
    }

    if (filters.kind === "blogger" && !orderIsBlogger(order)) return false;
    if (filters.kind === "regular" && orderIsBlogger(order)) return false;

    if (filters.scan !== "all" && orderScanState(order) !== filters.scan) return false;

    if (filters.comment === "with" && !orderHasComments(order)) return false;
    if (filters.comment === "without" && orderHasComments(order)) return false;

    if (filters.city !== "all") {
      const city = order.city?.trim() || "";
      if (city !== filters.city) return false;
    }

    if (filters.inStock && order.ready === false) return false;

    if (filters.fromAssembly && assembledOrderIds && !assembledOrderIds.has(order.id)) {
      return false;
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
        <div className="relative border-b border-gray-100 px-4 py-3 pr-14">
          <p className="font-semibold text-gray-900">Фильтр по вещам</p>
          {draft.length > 0 ? (
            <p className="mt-0.5 text-xs text-gray-500">
              Выбрано: {draft.length} · заказы с этими позициями
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-gray-500 active:bg-gray-100 active:text-gray-900"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 touch-scroll-y select-none overflow-y-auto overscroll-contain p-3 sm:p-4">
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
                        previewable={false}
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

        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setDraft([])}
            className="min-h-12 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 active:bg-gray-50"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(draft);
              onClose();
            }}
            className="min-h-12 rounded-xl bg-gray-900 text-sm font-medium text-white active:bg-gray-800"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  disabled,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 w-full touch-manipulation items-center justify-center rounded-xl px-3 text-center text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-60 ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-700 active:bg-gray-200"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function FilterSection({
  title,
  children,
  hint,
}: {
  title: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {title}
        </p>
        {hint ? <p className="truncate text-[11px] text-gray-400">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function InStockToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const nextValue = !value;

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => setPinOpen(true)}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 active:bg-gray-50"
      >
        <span>В наличии</span>
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            value ? "bg-gray-900" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </span>
      </button>
      <AdminPinPopup
        open={pinOpen}
        title="Код доступа"
        description={
          nextValue
            ? "Чтобы снова показывать только заказы в наличии"
            : "Чтобы показать заказы без наличия на складе"
        }
        verifyUrl="/api/guides/unlock"
        onClose={() => setPinOpen(false)}
        onSuccess={() => onChange(nextValue)}
      />
    </>
  );
}

function FromAssemblyToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => {
          if (value) {
            setPinOpen(true);
            return;
          }
          onChange(true);
        }}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 active:bg-gray-50"
      >
        <span>Только со сборки</span>
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            value ? "bg-gray-900" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </span>
      </button>
      <AdminPinPopup
        open={pinOpen}
        title="Код доступа"
        description="Чтобы показать заказы, которые ещё не собрали в приложении сборки"
        verifyUrl="/api/guides/unlock"
        onClose={() => setPinOpen(false)}
        onSuccess={() => onChange(false)}
      />
    </>
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

  return (
    <FilterSection title="Бренд">
      <div
        className="grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-label="Бренд"
      >
        {brands.map((brand) => {
          const active = brand === selected;
          const all = brand === ALL_BRANDS;
          return (
            <Chip
              key={brand}
              active={active}
              disabled={disabled}
              onClick={() => {
                if (brand === selected) return;
                noteClientAction(`brand-chip:${brand}`);
                onChange(brand);
              }}
              className={`${active ? "cursor-default" : ""} ${all ? "col-span-2" : ""}`}
            >
              <span className="truncate">{formatBrandLabel(brand)}</span>
            </Chip>
          );
        })}
      </div>
    </FilterSection>
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
      <aside className="hidden h-full w-72 shrink-0 flex-col gap-5 touch-scroll-y overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:flex">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {brandOnly ? "Архив" : "Фильтры"}
          </p>
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

        {brandOnly ? (
          <FilterSection title="Поиск">
            <KeyboardField
              value={filters.query}
              onChange={(next) => set("query", next)}
              debounceMs={250}
              placeholder="Номер, ФИО, город, трек…"
              title="Поиск в архиве"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
          </FilterSection>
        ) : (
          <>
            <FilterSection title="Наличие">
              <div className="space-y-2">
                <InStockToggle value={filters.inStock} onChange={(next) => set("inStock", next)} />
                <FromAssemblyToggle
                  value={filters.fromAssembly}
                  onChange={(next) => set("fromAssembly", next)}
                />
              </div>
            </FilterSection>

            <FilterSection title="Поиск">
              <KeyboardField
                value={filters.query}
                onChange={(next) => set("query", next)}
                applyOnCloseOnly
                placeholder="Номер, ФИО, город…"
                title="Поиск заказа"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
              />
            </FilterSection>

            <FilterSection title="Срочность">
              <div className="grid grid-cols-2 gap-2">
                <Chip active={filters.urgency === "all"} onClick={() => set("urgency", "all")}>
                  Все
                </Chip>
                {URGENCY_KEYS.map((key) => (
                  <Chip
                    key={key}
                    active={filters.urgency === key}
                    onClick={() => set("urgency", key)}
                  >
                    <span className="truncate">
                      {URGENCY_LABELS[key].label}
                      {key === "critical" ? ` (${counts.critical})` : ""}
                      {key === "rush" ? ` (${counts.rush})` : ""}
                    </span>
                  </Chip>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Тип">
              <div className="grid grid-cols-2 gap-2">
                <Chip active={filters.kind === "all"} onClick={() => set("kind", "all")}>
                  Все
                </Chip>
                <Chip
                  active={filters.kind === "blogger"}
                  onClick={() => set("kind", "blogger")}
                >
                  Блогеры ({counts.blogger})
                </Chip>
                <Chip
                  active={filters.kind === "regular"}
                  onClick={() => set("kind", "regular")}
                >
                  Обычные
                </Chip>
              </div>
            </FilterSection>

            {products.length > 0 && (
              <FilterSection title="Вещи">
                <Chip
                  active={selectedCount > 0}
                  onClick={() => setProductsOpen(true)}
                >
                  {selectedCount > 0 ? `Выбрано · ${selectedCount}` : "Выбрать вещи"}
                </Chip>
              </FilterSection>
            )}

            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_FILTERS })}
              className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-700 active:bg-gray-50"
            >
              Сбросить
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
  /** Показывать на всех ширинах (сборка на планшете) */
  alwaysVisible = false,
  /** Свернуть доп.фильтры по умолчанию, бренд остаётся сверху */
  collapsible = false,
  defaultExpanded = true,
  showFromAssembly = true,
  /** Для сборки: поиск и «Вещи» всегда снаружи свёрнутого блока */
  pinProductSearch = false,
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
  alwaysVisible?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  showFromAssembly?: boolean;
  pinProductSearch?: boolean;
}) {
  const [productsOpen, setProductsOpen] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const set = <K extends keyof OtpravkiFiltersState>(key: K, value: OtpravkiFiltersState[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const selectedCount = filters.productIds.length;
  const brand =
    selectedBrand && brandOptions.includes(selectedBrand)
      ? selectedBrand
      : brandOptions[0] ?? "";

  const filtersBody = brandOnly ? (
    <FilterSection title="Поиск">
      <KeyboardField
        value={filters.query}
        onChange={(next) => set("query", next)}
        debounceMs={250}
        placeholder="Поиск в архиве…"
        title="Поиск в архиве"
        className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
      />
    </FilterSection>
  ) : (
    <>
      {!pinProductSearch ? (
        <FilterSection title="Наличие">
          <div className="space-y-2">
            <InStockToggle value={filters.inStock} onChange={(next) => set("inStock", next)} />
            {showFromAssembly ? (
              <FromAssemblyToggle
                value={filters.fromAssembly}
                onChange={(next) => set("fromAssembly", next)}
              />
            ) : null}
          </div>
        </FilterSection>
      ) : null}

      {!pinProductSearch ? (
        <FilterSection title="Поиск">
          <KeyboardField
            value={filters.query}
            onChange={(next) => set("query", next)}
            applyOnCloseOnly
            placeholder="Поиск заказа…"
            title="Поиск заказа"
            className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
        </FilterSection>
      ) : null}

      <FilterSection title="Срочность">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Chip active={filters.urgency === "all"} onClick={() => set("urgency", "all")}>
            Все
          </Chip>
          {URGENCY_KEYS.map((key) => (
            <Chip
              key={key}
              active={filters.urgency === key}
              onClick={() => set("urgency", key)}
            >
              <span className="truncate">{URGENCY_LABELS[key].label}</span>
            </Chip>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Тип">
        <div className="grid grid-cols-3 gap-2">
          <Chip active={filters.kind === "all"} onClick={() => set("kind", "all")}>
            Все
          </Chip>
          <Chip
            active={filters.kind === "blogger"}
            onClick={() => set("kind", "blogger")}
          >
            Блогеры
          </Chip>
          <Chip
            active={filters.kind === "regular"}
            onClick={() => set("kind", "regular")}
          >
            Обычные
          </Chip>
        </div>
      </FilterSection>

      {!pinProductSearch && products.length > 0 ? (
        <FilterSection
          title="Вещи"
          hint={selectedCount > 0 ? `${selectedCount} выбрано` : undefined}
        >
          <Chip active={selectedCount > 0} onClick={() => setProductsOpen(true)}>
            {selectedCount > 0 ? `Выбрано · ${selectedCount}` : "Выбрать вещи"}
          </Chip>
        </FilterSection>
      ) : null}

      <ProductFilterModal
        open={productsOpen}
        onClose={() => setProductsOpen(false)}
        products={products}
        selectedIds={filters.productIds}
        onConfirm={(productIds) => onChange({ ...filters, productIds })}
      />
    </>
  );

  const pinnedSearch = pinProductSearch && !brandOnly ? (
    <>
      <FilterSection title="Поиск">
        <KeyboardField
          value={filters.query}
          onChange={(next) => set("query", next)}
          applyOnCloseOnly
          placeholder="Название вещи, размер…"
          title="Поиск в сборке"
          className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
        />
      </FilterSection>
      {products.length > 0 ? (
        <FilterSection
          title="Вещи"
          hint={selectedCount > 0 ? `${selectedCount} выбрано · или тапни фото в списке` : "или тапни фото в списке"}
        >
          <Chip active={selectedCount > 0} onClick={() => setProductsOpen(true)}>
            {selectedCount > 0 ? `Выбрано · ${selectedCount}` : "Выбрать по картинке"}
          </Chip>
        </FilterSection>
      ) : null}
    </>
  ) : null;

  const activeFilterHints =
    filters.urgency !== "all" ||
    filters.kind !== "all" ||
    (!pinProductSearch && filters.inStock) ||
    filters.productIds.length > 0 ||
    filters.query.trim().length > 0;

  return (
    <div className={`space-y-3 ${alwaysVisible ? "" : "lg:hidden"}`}>
      {brandOptions.length > 0 && onBrandChange && brand && (
        <BrandFilter
          brands={brandOptions}
          selected={brand}
          onChange={onBrandChange}
          disabled={brandDisabled}
        />
      )}

      {pinnedSearch}

      {collapsible && !brandOnly ? (
        <>
          <button
            type="button"
            data-no-drag-scroll
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex min-h-12 w-full touch-manipulation items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 active:bg-gray-50"
          >
            <span>
              Фильтры
              {activeFilterHints ? (
                <span className="ml-2 text-xs font-medium text-violet-600">есть</span>
              ) : null}
            </span>
            <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
          </button>
          {expanded ? filtersBody : null}
        </>
      ) : (
        filtersBody
      )}
    </div>
  );
}
