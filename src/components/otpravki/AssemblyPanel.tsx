"use client";

import { useEffect, useMemo, useState } from "react";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getAssemblyViewSections } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import { isRushUrgency, resolveOrderUrgency } from "@/lib/urgency";
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
import { OtpravkiPageHeader } from "./OtpravkiPageHeader";

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
    pollBrand: selectedBrand,
  });

  useOtpravkiNoSwipe();

  useEffect(() => {
    void refreshFromApi(selectedBrand);
  }, [refreshFromApi, selectedBrand]);

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
      if (isRushUrgency(urgency)) rush += 1;
      if (orderIsBlogger(order)) blogger += 1;
      const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const scanned = order.items.reduce((sum, item) => sum + item.scannedCount, 0);
      if (total > 0 && scanned >= total) ready += 1;
    }
    return { total: brandOrders.length, critical, rush, blogger, ready };
  }, [brandOrders]);

  const offline = !isInternetOnline || !isServerReachable;

  const handleBrandChange = (brand: string) => {
    const next = brand.trim();
    if (!next || next === selectedBrand) return;
    setSelectedBrand(next);
    setFilters(DEFAULT_FILTERS);
    void refreshFromApi(next);
  };

  return (
    <div className="otpravki-shell flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50 touch-pan-y overscroll-none">
      <OtpravkiPageHeader
        title="Сборка"
        subtitle={`${filteredAssemblyItems.length} поз. · ${filteredOrders.length} зак. · ${selectedBrand}`}
        onRefresh={() => {
          setReloading(true);
          void refreshFromApi(selectedBrand).finally(() => setReloading(false));
        }}
        refreshing={reloading || isSyncing}
        offline={offline}
        offlineMessage={!isInternetOnline ? "Нет интернета" : "Сервер недоступен"}
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
        />
      </OtpravkiPageHeader>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4">
        <OtpravkiFiltersPanel
          filters={filters}
          onChange={setFilters}
          counts={counts}
          products={products}
          brandOptions={brandOptions}
          selectedBrand={selectedBrand}
          onBrandChange={handleBrandChange}
          brandDisabled={reloading || isSyncing}
        />

        <main className="min-h-0 min-w-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
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
