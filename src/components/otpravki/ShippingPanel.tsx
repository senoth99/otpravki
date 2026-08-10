"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { computeCompletedAssemblyIds, getAssemblyViewSections } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import { resolveOrderUrgency } from "@/lib/urgency";
import type { AssemblyItem, ShippingOrder, ShippingTab } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { ArchiveView } from "./ArchiveView";
import { AssemblyView } from "./AssemblyView";
import {
  applyOrderFilters,
  collectFilterCities,
  DEFAULT_FILTERS,
  OtpravkiFiltersPanel,
  OtpravkiMobileFilters,
  type OtpravkiFiltersState,
} from "./OtpravkiFilters";
import { ShippingView } from "./ShippingView";
import { TabSwitcher } from "./TabSwitcher";

interface ShippingPanelProps {
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

export function ShippingPanel({
  assemblyItems: initialAssembly,
  orders: initialOrders,
  apiOrderIds: initialApiOrderIds = [],
  shippedArchive: initialShippedArchive = [],
  initialRevision = 0,
  warehouseMap,
}: ShippingPanelProps) {
  const [tab, setTab] = useState<ShippingTab>("assembly");
  const [selectedBrand, setSelectedBrand] = useState<string>(KNOWN_BRANDS[0]);
  const [filters, setFilters] = useState<OtpravkiFiltersState>(DEFAULT_FILTERS);
  const [assemblySettled, setAssemblySettled] = useState(false);
  const [pinnedCompletedIds, setPinnedCompletedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [reloading, setReloading] = useState(false);
  const {
    assemblyItems,
    orders,
    apiOrderIds,
    shippedArchive,
    updateAssembly,
    updateOrders,
    unshipFromArchive,
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

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("otpravki-noswipe");
    body.classList.add("otpravki-noswipe");

    const blockGesture = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    document.addEventListener("gesturestart", blockGesture as EventListener, { passive: false });
    document.addEventListener("touchmove", blockGesture, { passive: false });

    return () => {
      html.classList.remove("otpravki-noswipe");
      body.classList.remove("otpravki-noswipe");
      document.removeEventListener("gesturestart", blockGesture as EventListener);
      document.removeEventListener("touchmove", blockGesture);
    };
  }, []);

  const brandOrders = useMemo(
    () => orders.filter((order) => getOrderStoreBrand(order) === selectedBrand),
    [orders, selectedBrand],
  );

  const activeBrandOrders = useMemo(
    () => brandOrders.filter((order) => !order.barcodePrinted),
    [brandOrders],
  );

  const filteredOrders = useMemo(
    () => applyOrderFilters(activeBrandOrders, filters),
    [activeBrandOrders, filters],
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
    if (filters.query.trim() || filters.urgency !== "all" || filters.city !== "all") {
      const allowedKeys = new Set(
        filteredOrders.flatMap((order) =>
          order.items.map((item) => `${item.productId}-${item.sizeId}-${orderIsBlogger(order)}`),
        ),
      );
      if (allowedKeys.size === 0 && (filters.query || filters.urgency !== "all" || filters.city !== "all")) {
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

  const filteredShippedArchive = useMemo(() => {
    const brandArchive = shippedArchive.filter(
      (order) => getOrderStoreBrand(order) === selectedBrand,
    );
    return applyOrderFilters(brandArchive, { ...filters, scan: "all" });
  }, [selectedBrand, shippedArchive, filters]);

  const shippingViewOrders = useMemo(() => {
    const printed = brandOrders.filter((order) => order.barcodePrinted);
    return [...filteredOrders, ...printed];
  }, [brandOrders, filteredOrders]);

  const handleFilteredAssemblyChange = (nextItems: AssemblyItem[]) => {
    const nextById = new Map(nextItems.map((item) => [item.id, item]));
    updateAssembly(
      assemblyItems.map((item) =>
        (item.brand?.trim() || "CASHER") === selectedBrand ? (nextById.get(item.id) ?? item) : item,
      ),
    );
  };

  const handleFilteredOrdersChange = (
    nextOrders: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[]),
  ) => {
    const resolved =
      typeof nextOrders === "function" ? nextOrders(shippingViewOrders) : nextOrders;
    const nextById = new Map(resolved.map((order) => [order.id, order]));
    updateOrders(
      orders.map((order) => {
        if (getOrderStoreBrand(order) !== selectedBrand) return order;
        return nextById.get(order.id) ?? order;
      }),
    );
  };

  const assemblySections = useMemo(
    () =>
      getAssemblyViewSections(
        filteredAssemblyItems,
        filteredOrders,
        assemblySettled,
        assemblySettled ? pinnedCompletedIds : undefined,
      ),
    [filteredAssemblyItems, filteredOrders, assemblySettled, pinnedCompletedIds],
  );

  const brandOptions = useMemo(
    () => Array.from(new Set([...KNOWN_BRANDS, ...orders.map((order) => order.storeBrand?.trim() || "CASHER")])),
    [orders],
  );

  const cities = useMemo(() => collectFilterCities(activeBrandOrders), [activeBrandOrders]);

  const counts = useMemo(() => {
    let critical = 0;
    let rush = 0;
    let blogger = 0;
    let ready = 0;
    for (const order of activeBrandOrders) {
      const urgency = resolveOrderUrgency(order);
      if (urgency === "critical") critical += 1;
      if (urgency === "rush") rush += 1;
      if (orderIsBlogger(order)) blogger += 1;
      const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const scanned = order.items.reduce((sum, item) => sum + item.scannedCount, 0);
      if (total > 0 && scanned >= total) ready += 1;
    }
    return { total: activeBrandOrders.length, critical, rush, blogger, ready };
  }, [activeBrandOrders]);

  const offline = !isInternetOnline || !isServerReachable;

  const handleBrandChange = (brand: string) => {
    setSelectedBrand(brand);
    setFilters(DEFAULT_FILTERS);
    void refreshFromApi(brand);
  };

  const handleReload = () => {
    setReloading(true);
    window.location.reload();
  };

  const handleTabChange = (next: ShippingTab) => {
    if (tab === "assembly" && next !== "assembly") {
      setAssemblySettled(true);
    }
    if (next === "assembly" && assemblySettled) {
      setPinnedCompletedIds(new Set(computeCompletedAssemblyIds(filteredAssemblyItems, filteredOrders)));
    }
    setTab(next);
  };

  return (
    <div className="otpravki-shell flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50 touch-pan-y overscroll-none">
      <header className="safe-top shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 sm:text-xl">Отправки</h1>
            <p className="text-xs text-gray-500">Сборка и отправка заказов</p>
          </div>

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
            onClick={handleReload}
            disabled={reloading}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 active:bg-gray-50 disabled:opacity-60"
          >
            <svg className={`h-4 w-4 ${reloading || isSyncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {reloading ? "Обновление…" : "Обновить"}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabSwitcher active={tab} onChange={handleTabChange} />
          <p className="text-xs text-gray-500">
            Показано {tab === "archive" ? filteredShippedArchive.length : filteredOrders.length}
            {tab !== "archive" ? ` из ${activeBrandOrders.length}` : ""}
          </p>
        </div>

        {offline && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {!isInternetOnline ? "Нет интернета" : "Сервер недоступен"}
          </div>
        )}

        <div className="mt-3">
          <OtpravkiMobileFilters filters={filters} onChange={setFilters} cities={cities} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4">
        <OtpravkiFiltersPanel
          side="left"
          filters={filters}
          onChange={setFilters}
          cities={cities}
          counts={counts}
        />

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
          {tab === "assembly" ? (
            <AssemblyView
              sections={assemblySections}
              allItems={filteredAssemblyItems}
              orders={filteredOrders}
              onItemsChange={handleFilteredAssemblyChange}
              warehouseMap={warehouseMap}
            />
          ) : tab === "shipping" ? (
            <ShippingView
              orders={shippingViewOrders}
              assemblyItems={filteredAssemblyItems}
              selectedBrand={selectedBrand}
              brandOptions={brandOptions}
              onBrandChange={handleBrandChange}
              onOrdersChange={handleFilteredOrdersChange}
            />
          ) : (
            <ArchiveView
              orders={filteredOrders}
              shippedArchive={filteredShippedArchive}
              apiOrderIds={apiOrderIds}
              onUnship={unshipFromArchive}
            />
          )}
        </main>

        <OtpravkiFiltersPanel
          side="right"
          filters={filters}
          onChange={setFilters}
          cities={cities}
          counts={counts}
        />
      </div>
    </div>
  );
}
