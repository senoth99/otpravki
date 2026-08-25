"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useAuth } from "@/components/auth/AuthGate";
import { FilterBusyOverlay } from "@/components/ui/FilterBusyOverlay";
import { StageLoadingScreen } from "@/components/ui/StageLoadingScreen";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { useWorkspace } from "@/hooks/useWorkspace";
import { noteClientAction } from "@/lib/client-diag";
import { ORDERS_API_POLL_MS } from "@/lib/orders-sync";
import { orderIsBlogger } from "@/lib/blogger-order";
import { isRushUrgency, resolveOrderUrgency } from "@/lib/urgency";
import {
  applyProgressToAssemblyItems,
  fetchAssemblyProgress,
  subscribeAssemblyProgress,
  type AssemblyProgressState,
} from "@/lib/assembly-progress";
import { collectedReadyOrderIds, partiallyCollectedOrderIds } from "@/lib/assembly-status";
import { ALL_BRANDS, formatBrandLabel, getStoreBrand, matchesStoreBrand } from "@/lib/store-brand";
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
import { KirillMascot } from "./KirillMascot";
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
  return getStoreBrand(order.storeBrand);
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
  const [selectedBrand, setSelectedBrand] = useState<string>(ALL_BRANDS);
  const [filters, setFilters] = useState<OtpravkiFiltersState>(DEFAULT_FILTERS);
  const [reloading, setReloading] = useState(false);
  const [filterPending, startFilterTransition] = useTransition();
  const [progress, setProgress] = useState<AssemblyProgressState | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
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
  });

  useOtpravkiNoSwipe("monitor");

  // Полный pull всех брендов — не только выбранного (иначе AMMO/Кураж «пустые»).
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled || document.visibilityState !== "visible" || !navigator.onLine) return;
      void refreshFromApi(undefined, { silent: true });
    };
    run();
    const timer = window.setInterval(run, ORDERS_API_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshFromApi]);

  useEffect(() => {
    let cancelled = false;
    void fetchAssemblyProgress().then((next) => {
      if (!cancelled && next) setProgress(next);
    });
    const unsub = subscribeAssemblyProgress({
      onProgress: (next) => {
        if (next.revision < (progressRef.current?.revision ?? 0)) return;
        setProgress(next);
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

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

  const brandOrders = useMemo(
    () => orders.filter((order) => matchesStoreBrand(order.storeBrand, selectedBrand)),
    [orders, selectedBrand],
  );

  const activeBrandOrders = useMemo(
    () => brandOrders.filter((order) => !order.barcodePrinted),
    [brandOrders],
  );

  const notReadyCount = useMemo(
    () => activeBrandOrders.filter((order) => order.ready === false).length,
    [activeBrandOrders],
  );

  const syncedAssemblyItems = useMemo(
    () => applyProgressToAssemblyItems(assemblyItems, progress),
    [assemblyItems, progress],
  );

  const assembledOrderIds = useMemo(
    () => collectedReadyOrderIds(orders, syncedAssemblyItems),
    [orders, syncedAssemblyItems],
  );

  const partialOrderIds = useMemo(
    () => partiallyCollectedOrderIds(orders, syncedAssemblyItems),
    [orders, syncedAssemblyItems],
  );

  /** «Только со сборки» = полностью + частично собранные (браслет Luxe Club и т.п.). */
  const fromAssemblyOrderIds = useMemo(() => {
    const ids = new Set(assembledOrderIds);
    for (const id of partialOrderIds) ids.add(id);
    return ids;
  }, [assembledOrderIds, partialOrderIds]);

  const filteredOrders = useMemo(() => {
    return applyOrderFilters(
      activeBrandOrders,
      {
        ...filters,
        // Поиск не режет список отправок — иначе Chrome убивает вкладку на 1–2 символах.
        // ShippingView сам прыгает к совпадению по searchQuery.
        query: "",
      },
      { assembledOrderIds: filters.fromAssembly ? fromAssemblyOrderIds : assembledOrderIds },
    );
  }, [
      activeBrandOrders,
      assembledOrderIds,
      fromAssemblyOrderIds,
      filters.urgency,
      filters.kind,
      filters.scan,
      filters.comment,
      filters.city,
      filters.productIds,
      filters.inStock,
      filters.fromAssembly,
    ],
  );

  // Truthy → заголовок «Нет готовых к отправке» (текст-пояснение больше не показываем).
  const emptyHint =
    filteredOrders.length === 0 && activeBrandOrders.length > 0 ? "filtered" : null;

  const filteredAssemblyItems = useMemo(
    () =>
      syncedAssemblyItems.filter((item) => matchesStoreBrand(item.brand, selectedBrand)),
    [syncedAssemblyItems, selectedBrand],
  );

  const handleFilteredOrdersChange = (
    nextOrders: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[]),
  ) => {
    const resolved =
      typeof nextOrders === "function" ? nextOrders(filteredOrders) : nextOrders;
    const nextById = new Map(resolved.map((order) => [order.id, order]));
    updateOrders(
      orders.map((order) => {
        if (!matchesStoreBrand(order.storeBrand, selectedBrand)) return order;
        return nextById.get(order.id) ?? order;
      }),
    );
  };

  const brandOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ALL_BRANDS,
          ...KNOWN_BRANDS,
          ...orders.map((order) => getOrderStoreBrand(order)),
        ]),
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

  /** Неотправленные заказы по всем брендам (как пришло из API). */
  const shippingOrderCount = useMemo(
    () => orders.filter((order) => !order.barcodePrinted).length,
    [orders],
  );

  const offline = !isInternetOnline || !isServerReachable;

  const handleBrandChange = useCallback((brand: string) => {
    const next = brand.trim();
    if (!next || next === selectedBrand) return;
    noteClientAction(`brand-filter:${next}`);
    startFilterTransition(() => {
      setSelectedBrand(next);
      // «В наличии» и «Только со сборки» оставляем; остальное сбрасываем.
      setFilters((prev) => ({
        ...DEFAULT_FILTERS,
        inStock: prev.inStock,
        fromAssembly: prev.fromAssembly,
      }));
    });
  }, [selectedBrand]);

  const handleFiltersChange = useCallback((next: OtpravkiFiltersState) => {
    startFilterTransition(() => {
      setFilters(next);
    });
  }, []);

  return (
    <div className="otpravki-shell otpravki-shell-monitor relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50 overscroll-none">
      {reloading ? <StageLoadingScreen variant="overlay" /> : null}
      {!reloading && filterPending ? <FilterBusyOverlay /> : null}
      <OtpravkiPageHeader
        title="Отправки"
        subtitle={
          tab === "archive"
            ? `${shippedArchive.filter((order) => matchesStoreBrand(order.storeBrand, selectedBrand)).length} в архиве · ${formatBrandLabel(selectedBrand)}`
            : filters.fromAssembly
              ? `${filteredOrders.length} со сборки · ${formatBrandLabel(selectedBrand)}`
              : `${filteredOrders.length} готовы · ${notReadyCount} ждут склад · ${formatBrandLabel(selectedBrand)}`
        }
        onRefresh={() => {
          setReloading(true);
          noteClientAction("refresh:all-brands");
          // Полный sync всех брендов — иначе AMMO/Кураж/SHECASH остаются пустыми
          void refreshFromApi(undefined).finally(() => setReloading(false));
        }}
        refreshing={reloading || isSyncing}
        offline={offline}
        offlineMessage={!isInternetOnline ? "Нет интернета" : "Сервер недоступен"}
        shippingTab={tab}
        onShippingTabChange={handleTabChange}
      >
        <OtpravkiMobileFilters
          filters={filters}
          onChange={handleFiltersChange}
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
          onChange={handleFiltersChange}
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
              onOrderShipped={() => scheduleRefreshAfterShip(undefined)}
              selectionResetKey={`${selectedBrand}:${filters.urgency}:${filters.kind}:${filters.inStock}:${filters.fromAssembly}:${filters.productIds.join(",")}`}
              searchQuery={filters.query}
              emptyHint={emptyHint}
              assemblyReadyBy={filters.fromAssembly ? "collected" : "stock"}
            />
          ) : (
            <ArchiveView
              orders={filteredOrders}
              shippedArchive={shippedArchive.filter(
                (order) => matchesStoreBrand(order.storeBrand, selectedBrand),
              )}
              apiOrderIds={apiOrderIds}
              onUnship={unshipFromArchive}
              query={filters.query}
              onQueryChange={(query) => setFilters((prev) => ({ ...prev, query }))}
            />
          )}
        </main>
      </div>

      {tab === "shipping" ? <KirillMascot orderCount={shippingOrderCount} /> : null}
    </div>
  );
}
