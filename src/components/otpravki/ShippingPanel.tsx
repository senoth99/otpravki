"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthGate";
import { StageLoadingScreen } from "@/components/ui/StageLoadingScreen";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { useWorkspace } from "@/hooks/useWorkspace";
import { orderIsBlogger } from "@/lib/blogger-order";
import { isRushUrgency, resolveOrderUrgency } from "@/lib/urgency";
import type { AssemblyItem, ShippingOrder, ShippingTab } from "@/types/shipping";
import { ArchiveView } from "./ArchiveView";
import {
  applyOrderFilters,
  collectFilterCities,
  collectFilterProducts,
  DEFAULT_FILTERS,
  OtpravkiFiltersPanel,
  OtpravkiMobileFilters,
  type OtpravkiFiltersState,
} from "./OtpravkiFilters";
import { OtpravkiPageHeader } from "./OtpravkiPageHeader";
import { ShippingView } from "./ShippingView";

interface ShippingPanelProps {
  assemblyItems: AssemblyItem[];
  orders: ShippingOrder[];
  apiOrderIds?: string[];
  shippedArchive?: ShippingOrder[];
  initialRevision?: number;
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
}: ShippingPanelProps) {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<ShippingTab>("shipping");
  const [selectedBrand, setSelectedBrand] = useState<string>(KNOWN_BRANDS[0]);
  const [filters, setFilters] = useState<OtpravkiFiltersState>(DEFAULT_FILTERS);
  const [reloading, setReloading] = useState(false);
  const {
    assemblyItems,
    orders,
    apiOrderIds,
    shippedArchive,
    updateOrders,
    unshipFromArchive,
    isInternetOnline,
    isServerReachable,
    refreshFromApi,
    scheduleRefreshAfterShip,
    isSyncing,
  } = useWorkspace({
    initialAssembly,
    initialOrders,
    initialApiOrderIds,
    initialShippedArchive,
    initialRevision,
    pollBrand: selectedBrand,
  });

  useOtpravkiNoSwipe();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (tabParam === "archive") setTab("archive");
    if (tabParam === "shipping") setTab("shipping");
  }, []);

  useEffect(() => {
    if (loading) return;
    const tabParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tab")
        : null;
    if (tabParam === "archive" || tabParam === "shipping") return;
    if (user) setTab("shipping");
  }, [loading, user]);

  useEffect(() => {
    setReloading(true);
    void refreshFromApi(selectedBrand).finally(() => setReloading(false));
  }, [refreshFromApi, selectedBrand]);

  const brandOrders = useMemo(
    () => orders.filter((order) => getOrderStoreBrand(order) === selectedBrand),
    [orders, selectedBrand],
  );

  const activeBrandOrders = useMemo(
    () => brandOrders.filter((order) => !order.barcodePrinted),
    [brandOrders],
  );

  const filteredOrders = useMemo(
    () =>
      applyOrderFilters(activeBrandOrders, {
        ...filters,
        // Поиск не режет список отправок — иначе Chrome убивает вкладку на 1–2 символах.
        // ShippingView сам прыгает к совпадению по searchQuery.
        query: "",
      }),
    [
      activeBrandOrders,
      filters.urgency,
      filters.kind,
      filters.scan,
      filters.comment,
      filters.city,
      filters.productIds,
      filters.inStock,
    ],
  );

  const filteredAssemblyItems = useMemo(
    () =>
      assemblyItems.filter((item) => (item.brand?.trim() || "CASHER") === selectedBrand),
    [assemblyItems, selectedBrand],
  );

  const filteredShippedArchive = useMemo(() => {
    const brandArchive = shippedArchive.filter(
      (order) => getOrderStoreBrand(order) === selectedBrand,
    );
    return applyOrderFilters(brandArchive, { ...filters, scan: "all" });
  }, [selectedBrand, shippedArchive, filters]);

  const handleFilteredOrdersChange = (
    nextOrders: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[]),
  ) => {
    const resolved =
      typeof nextOrders === "function" ? nextOrders(filteredOrders) : nextOrders;
    const nextById = new Map(resolved.map((order) => [order.id, order]));
    updateOrders(
      orders.map((order) => {
        if (getOrderStoreBrand(order) !== selectedBrand) return order;
        return nextById.get(order.id) ?? order;
      }),
    );
  };

  const brandOptions = useMemo(
    () =>
      Array.from(
        new Set([...KNOWN_BRANDS, ...orders.map((order) => order.storeBrand?.trim() || "CASHER")]),
      ),
    [orders],
  );

  const cities = useMemo(() => collectFilterCities(activeBrandOrders), [activeBrandOrders]);
  const products = useMemo(() => {
    // Архив: не пересчитываем товары на каждый символ поиска
    if (tab === "archive") return [];
    return collectFilterProducts(activeBrandOrders);
  }, [tab, activeBrandOrders]);

  const handleTabChange = (next: ShippingTab) => {
    setTab(next);
  };

  const counts = useMemo(() => {
    let critical = 0;
    let rush = 0;
    let blogger = 0;
    let ready = 0;
    for (const order of activeBrandOrders) {
      const urgency = resolveOrderUrgency(order);
      if (urgency === "critical") critical += 1;
      if (isRushUrgency(urgency)) rush += 1;
      if (orderIsBlogger(order)) blogger += 1;
      const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const scanned = order.items.reduce((sum, item) => sum + item.scannedCount, 0);
      if (total > 0 && scanned >= total) ready += 1;
    }
    return { total: activeBrandOrders.length, critical, rush, blogger, ready };
  }, [activeBrandOrders]);

  const offline = !isInternetOnline || !isServerReachable;

  const handleBrandChange = useCallback((brand: string) => {
    const next = brand.trim();
    if (!next || next === selectedBrand) return;
    setSelectedBrand(next);
    setFilters(DEFAULT_FILTERS);
  }, [selectedBrand]);

  const showLoadOverlay = reloading;

  return (
    <div className="otpravki-shell relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50 touch-pan-y overscroll-none">
      {showLoadOverlay ? <StageLoadingScreen variant="overlay" /> : null}
      <OtpravkiPageHeader
        title="Отправки"
        subtitle={
          tab === "archive"
            ? `${shippedArchive.filter((order) => getOrderStoreBrand(order) === selectedBrand).length} в архиве · ${selectedBrand}`
            : `${filteredOrders.length} из ${activeBrandOrders.length} · ${selectedBrand}`
        }
        onRefresh={() => {
          setReloading(true);
          void refreshFromApi(selectedBrand).finally(() => setReloading(false));
        }}
        refreshing={reloading || isSyncing}
        offline={offline}
        offlineMessage={!isInternetOnline ? "Нет интернета" : "Сервер недоступен"}
        shippingTab={tab}
        onShippingTabChange={handleTabChange}
      >
        <OtpravkiMobileFilters
          filters={filters}
          onChange={setFilters}
          cities={cities}
          products={products}
          brandOptions={brandOptions}
          selectedBrand={selectedBrand}
          onBrandChange={handleBrandChange}
          brandDisabled={reloading || isSyncing}
          brandOnly={tab === "archive"}
        />
      </OtpravkiPageHeader>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4">
        <OtpravkiFiltersPanel
          filters={filters}
          onChange={setFilters}
          counts={counts}
          products={tab === "archive" ? [] : products}
          brandOptions={brandOptions}
          selectedBrand={selectedBrand}
          onBrandChange={handleBrandChange}
          brandDisabled={reloading || isSyncing}
          brandOnly={tab === "archive"}
        />

        <main className="min-h-0 min-w-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
          {tab === "shipping" ? (
            <ShippingView
              orders={filteredOrders}
              assemblyItems={filteredAssemblyItems}
              selectedBrand={selectedBrand}
              brandOptions={brandOptions}
              onBrandChange={handleBrandChange}
              onOrdersChange={handleFilteredOrdersChange}
              onOrderShipped={() => scheduleRefreshAfterShip(selectedBrand)}
              selectionResetKey={`${selectedBrand}:${filters.urgency}:${filters.kind}:${filters.inStock}:${filters.productIds.join(",")}`}
              searchQuery={filters.query}
            />
          ) : (
            <ArchiveView
              orders={filteredOrders}
              shippedArchive={shippedArchive.filter(
                (order) => getOrderStoreBrand(order) === selectedBrand,
              )}
              apiOrderIds={apiOrderIds}
              onUnship={unshipFromArchive}
              query={filters.query}
              onQueryChange={(query) => setFilters((prev) => ({ ...prev, query }))}
            />
          )}
        </main>
      </div>
    </div>
  );
}
