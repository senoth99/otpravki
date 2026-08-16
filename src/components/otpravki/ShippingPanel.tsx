"use client";

import { useEffect, useMemo, useState } from "react";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { useWorkspace } from "@/hooks/useWorkspace";
import { orderIsBlogger } from "@/lib/blogger-order";
import { resolveOrderUrgency } from "@/lib/urgency";
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
import { TabSwitcher } from "./TabSwitcher";

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
    isSyncing,
  } = useWorkspace({
    initialAssembly,
    initialOrders,
    initialApiOrderIds,
    initialShippedArchive,
    initialRevision,
  });

  useOtpravkiNoSwipe();

  useEffect(() => {
    void refreshFromApi(selectedBrand);
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
    () => applyOrderFilters(activeBrandOrders, filters),
    [activeBrandOrders, filters],
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
  const products = useMemo(() => collectFilterProducts(activeBrandOrders), [activeBrandOrders]);

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
  };

  return (
    <div className="otpravki-shell flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50 touch-pan-y overscroll-none">
      <OtpravkiPageHeader
        title="Отправки"
        subtitle={
          tab === "archive"
            ? `${filteredShippedArchive.length} в архиве · ${selectedBrand}`
            : `${filteredOrders.length} из ${activeBrandOrders.length} · ${selectedBrand}`
        }
        brandOptions={brandOptions}
        selectedBrand={selectedBrand}
        onBrandChange={handleBrandChange}
        onRefresh={() => {
          setReloading(true);
          void refreshFromApi(selectedBrand).finally(() => setReloading(false));
        }}
        refreshing={reloading || isSyncing}
        offline={offline}
        offlineMessage={!isInternetOnline ? "Нет интернета" : "Сервер недоступен"}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabSwitcher active={tab} onChange={setTab} />
        </div>

        <OtpravkiMobileFilters
          filters={filters}
          onChange={setFilters}
          cities={cities}
          products={products}
        />
      </OtpravkiPageHeader>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4">
        <OtpravkiFiltersPanel
          filters={filters}
          onChange={setFilters}
          counts={counts}
          products={products}
        />

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
          {tab === "shipping" ? (
            <ShippingView
              orders={filteredOrders}
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
      </div>
    </div>
  );
}
