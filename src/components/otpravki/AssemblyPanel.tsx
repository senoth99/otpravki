"use client";

import { useMemo, useState } from "react";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getAssemblyViewSections } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import { resolveOrderUrgency } from "@/lib/urgency";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { AssemblyView } from "./AssemblyView";
import {
  applyOrderFilters,
  collectFilterCities,
  collectFilterProducts,
  DEFAULT_FILTERS,
  OtpravkiFiltersPanel,
  OtpravkiMobileFilters,
  type OtpravkiFiltersState,
} from "./OtpravkiFilters";

interface AssemblyPanelProps {
  assemblyItems: AssemblyItem[];
  orders: ShippingOrder[];
  apiOrderIds?: string[];
  shippedArchive?: ShippingOrder[];
  initialRevision?: number;
  warehouseMap?: WarehouseMapConfig;
}

const KNOWN_BRANDS = ["CASHER", "SHECASH", "AMMO", "KURAZHDVIZH"] as const;

function getOrderStoreBrand(order: ShippingOrder): string {
  return order.storeBrand?.trim() || "CASHER";
}

export function AssemblyPanel({
  assemblyItems: initialAssembly,
  orders: initialOrders,
  apiOrderIds: initialApiOrderIds = [],
  shippedArchive: initialShippedArchive = [],
  initialRevision = 0,
  warehouseMap,
}: AssemblyPanelProps) {
  const [selectedBrand, setSelectedBrand] = useState<string>(KNOWN_BRANDS[0]);
  const [filters, setFilters] = useState<OtpravkiFiltersState>(DEFAULT_FILTERS);
  const [reloading, setReloading] = useState(false);
  const {
    assemblyItems,
    orders,
    updateAssembly,
    isInternetOnline,
    isServerReachable,
    refreshFromApi,
    isSyncing,
  } = useWorkspace({
    initialAssembly,
    initialOrders,
    initialApiOrderIds,
    initialShippedArchive,
    initialRevision,
  });

  useOtpravkiNoSwipe();

  const brandOrders = useMemo(
    () => orders.filter((order) => getOrderStoreBrand(order) === selectedBrand && !order.barcodePrinted),
    [orders, selectedBrand],
  );

  const filteredOrders = useMemo(
    () => applyOrderFilters(brandOrders, { ...filters, scan: "all" }),
    [brandOrders, filters],
  );

  const filteredAssemblyItems = useMemo(() => {
    const brandAsm = assemblyItems.filter(
      (item) => (item.brand?.trim() || "CASHER") === selectedBrand,
    );
    if (filters.kind === "blogger") {
      return brandAsm.filter((item) => item.isBlogger === true);
    }
    if (filters.kind === "regular") {
      return brandAsm.filter((item) => item.isBlogger !== true);
    }
    if (filters.query.trim() || filters.urgency !== "all" || filters.city !== "all" || filters.productIds.length > 0) {
      const allowedKeys = new Set(
        filteredOrders.flatMap((order) =>
          order.items.map((item) => `${item.productId}-${item.sizeId}-${orderIsBlogger(order)}`),
        ),
      );
      if (
        allowedKeys.size === 0 &&
        (filters.query || filters.urgency !== "all" || filters.city !== "all" || filters.productIds.length > 0)
      ) {
        return [];
      }
      if (allowedKeys.size > 0) {
        return brandAsm.filter((item) =>
          allowedKeys.has(`${item.productId}-${item.sizeId}-${item.isBlogger === true}`),
        );
      }
    }
    return brandAsm;
  }, [assemblyItems, selectedBrand, filters, filteredOrders]);

  const handleFilteredAssemblyChange = (nextItems: AssemblyItem[]) => {
    const nextById = new Map(nextItems.map((item) => [item.id, item]));
    updateAssembly(
      assemblyItems.map((item) =>
        (item.brand?.trim() || "CASHER") === selectedBrand ? (nextById.get(item.id) ?? item) : item,
      ),
    );
  };

  const assemblySections = useMemo(
    () => getAssemblyViewSections(filteredAssemblyItems, filteredOrders, false),
    [filteredAssemblyItems, filteredOrders],
  );

  const brandOptions = useMemo(
    () =>
      Array.from(
        new Set([...KNOWN_BRANDS, ...orders.map((order) => order.storeBrand?.trim() || "CASHER")]),
      ),
    [orders],
  );

  const cities = useMemo(() => collectFilterCities(brandOrders), [brandOrders]);
  const products = useMemo(() => collectFilterProducts(brandOrders), [brandOrders]);

  const counts = useMemo(() => {
    let critical = 0;
    let rush = 0;
    let blogger = 0;
    let ready = 0;
    for (const order of brandOrders) {
      const urgency = resolveOrderUrgency(order);
      if (urgency === "critical") critical += 1;
      if (urgency === "rush") rush += 1;
      if (orderIsBlogger(order)) blogger += 1;
      const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const scanned = order.items.reduce((sum, item) => sum + item.scannedCount, 0);
      if (total > 0 && scanned >= total) ready += 1;
    }
    return { total: brandOrders.length, critical, rush, blogger, ready };
  }, [brandOrders]);

  const offline = !isInternetOnline || !isServerReachable;

  const handleBrandChange = (brand: string) => {
    setSelectedBrand(brand);
    setFilters(DEFAULT_FILTERS);
    void refreshFromApi(brand);
  };

  return (
    <div className="otpravki-shell flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50 touch-pan-y overscroll-none">
      <header className="safe-top shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 sm:text-xl">Сборка</h1>
            <p className="text-xs text-gray-500">Позиции на сборку со склада</p>
          </div>

          <a
            href="/otpravki"
            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 active:bg-gray-50"
          >
            Отправки
          </a>

          <a
            href="/chestnye-znaki"
            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 active:bg-gray-50"
          >
            Честные знаки
          </a>

          {brandOptions.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Бренд</span>
              <select
                value={selectedBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                disabled={isSyncing || reloading}
                className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:opacity-60"
              >
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setReloading(true);
              window.location.reload();
            }}
            disabled={reloading}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 active:bg-gray-50 disabled:opacity-60"
          >
            <svg
              className={`h-4 w-4 ${reloading || isSyncing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {reloading ? "Обновление…" : "Обновить"}
          </button>
        </div>

        {offline && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {!isInternetOnline ? "Нет интернета" : "Сервер недоступен"}
          </div>
        )}

        <div className="mt-3">
          <OtpravkiMobileFilters
            filters={filters}
            onChange={setFilters}
            cities={cities}
            products={products}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4">
        <OtpravkiFiltersPanel
          filters={filters}
          onChange={setFilters}
          counts={counts}
          products={products}
        />

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
          <AssemblyView
            sections={assemblySections}
            allItems={filteredAssemblyItems}
            orders={filteredOrders}
            onItemsChange={handleFilteredAssemblyChange}
            warehouseMap={warehouseMap}
          />
        </main>
      </div>
    </div>
  );
}
