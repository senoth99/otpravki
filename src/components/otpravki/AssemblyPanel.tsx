"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { StageLoadingScreen } from "@/components/ui/StageLoadingScreen";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { useWorkspace } from "@/hooks/useWorkspace";
import { noteClientAction } from "@/lib/client-diag";
import { ORDERS_API_POLL_MS } from "@/lib/orders-sync";
import {
  applyProgressToAssemblyItems,
  fetchAssemblyProgress,
  pushAssemblyProgress,
  staleAssemblyProgressPatch,
  subscribeAssemblyProgress,
  type AssemblyProgressState,
} from "@/lib/assembly-progress";
import { getAssemblyViewSections } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import {
  ALL_BRANDS,
  formatBrandLabel,
  getStoreBrand,
  isAllBrands,
  matchesStoreBrand,
} from "@/lib/store-brand";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { AssemblyView } from "./AssemblyView";
import {
  applyOrderFilters,
  collectFilterProducts,
  collectFilterProductsFromAssembly,
  DEFAULT_FILTERS,
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
  return getStoreBrand(order.storeBrand);
}

export function AssemblyPanel({
  assemblyItems: initialAssembly,
  orders: initialOrders,
  apiOrderIds: initialApiOrderIds = [],
  shippedArchive: initialShippedArchive = [],
  initialRevision = 0,
  warehouseMap,
}: AssemblyPanelProps) {
  const [selectedBrand, setSelectedBrand] = useState<string>(ALL_BRANDS);
  const [filters, setFilters] = useState<OtpravkiFiltersState>(DEFAULT_FILTERS);
  const [reloading, setReloading] = useState(false);
  const [filterPending, startFilterTransition] = useTransition();
  const [progress, setProgress] = useState<AssemblyProgressState | null>(null);
  const [resetCollectedBusy, setResetCollectedBusy] = useState(false);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const {
    assemblyItems,
    orders,
    isInternetOnline,
    isServerReachable,
    refreshFromApi,
  } = useWorkspace({
    initialAssembly,
    initialOrders,
    initialApiOrderIds,
    initialShippedArchive,
    initialRevision,
  });

  useOtpravkiNoSwipe("tablet");

  // Полный pull Casher (все бренды), как в отправках — не застреваем на старом кэше.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled || document.visibilityState !== "visible" || !navigator.onLine) return;
      noteClientAction("sborka:sync");
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

  const syncedAssemblyItems = useMemo(
    () => applyProgressToAssemblyItems(assemblyItems, progress),
    [assemblyItems, progress],
  );

  // После отгрузки спрос падает — чистим «собрано» по исчезнувшим/урезанным позициям.
  useEffect(() => {
    const patch = staleAssemblyProgressPatch(assemblyItems, progress);
    if (patch.length === 0) return;
    let cancelled = false;
    void pushAssemblyProgress(patch).then((remote) => {
      if (!cancelled && remote) setProgress(remote);
    });
    return () => {
      cancelled = true;
    };
  }, [assemblyItems, progress]);

  const brandOrders = useMemo(
    () =>
      orders.filter(
        (order) => matchesStoreBrand(order.storeBrand, selectedBrand) && !order.barcodePrinted,
      ),
    [orders, selectedBrand],
  );

  const filteredOrders = useMemo(
    () => applyOrderFilters(brandOrders, { ...filters, scan: "all" }),
    [brandOrders, filters],
  );

  const filteredAssemblyItems = useMemo(() => {
    let brandAsm = syncedAssemblyItems.filter(
      (item) => matchesStoreBrand(item.brand, selectedBrand) && item.quantity > 0,
    );
    if (filters.kind === "blogger") {
      brandAsm = brandAsm.filter((item) => item.isBlogger === true);
    } else if (filters.kind === "regular") {
      brandAsm = brandAsm.filter((item) => item.isBlogger !== true);
    }

    if (filters.productIds.length > 0) {
      const wanted = new Set(filters.productIds);
      brandAsm = brandAsm.filter((item) => wanted.has(item.productId));
    }

    const q = filters.query.trim().toLowerCase();
    if (q) {
      brandAsm = brandAsm.filter((item) => {
        const hay = [item.productName, item.brand, item.size, item.barcodeId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (filters.urgency !== "all" || filters.city !== "all") {
      const allowedKeys = new Set(
        filteredOrders.flatMap((order) =>
          order.items.map((item) => `${item.productId}-${item.sizeId}-${orderIsBlogger(order)}`),
        ),
      );
      if (allowedKeys.size === 0) return [];
      brandAsm = brandAsm.filter((item) =>
        allowedKeys.has(`${item.productId}-${item.sizeId}-${item.isBlogger === true}`),
      );
    }

    return brandAsm;
  }, [syncedAssemblyItems, selectedBrand, filters, filteredOrders]);

  const handleFindProduct = (productId: string) => {
    const id = productId.trim();
    if (!id) return;
    startFilterTransition(() => {
      setFilters((prev) => {
        const onlyThis = prev.productIds.length === 1 && prev.productIds[0] === id;
        return {
          ...prev,
          productIds: onlyThis ? [] : [id],
        };
      });
    });
  };

  const handleFilteredAssemblyChange = (nextItems: AssemblyItem[]) => {
    const prevById = new Map(syncedAssemblyItems.map((item) => [item.id, item]));
    const patch: Array<{ id: string; collectedCount: number; collectedAt?: number }> = [];

    for (const item of nextItems) {
      const prev = prevById.get(item.id);
      if (!prev || prev.collectedCount === item.collectedCount) continue;
      patch.push({
        id: item.id,
        collectedCount: item.collectedCount,
        collectedAt: item.collectedAt,
      });
    }
    if (patch.length === 0) return;

    setProgress((current) => {
      const items = { ...(current?.items ?? {}) };
      for (const row of patch) {
        if (row.collectedCount <= 0) delete items[row.id];
        else {
          items[row.id] = {
            collectedCount: row.collectedCount,
            collectedAt: row.collectedAt,
          };
        }
      }
      return {
        revision: current?.revision ?? 0,
        updatedAt: Date.now(),
        updatedBy: "local",
        items,
      };
    });

    void pushAssemblyProgress(patch).then((remote) => {
      if (remote) setProgress(remote);
    });
  };

  const assemblySections = useMemo(
    () => getAssemblyViewSections(filteredAssemblyItems, filteredOrders, false, undefined, brandOrders),
    [filteredAssemblyItems, filteredOrders, brandOrders],
  );

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

  const products = useMemo(() => {
    const fromOrders = collectFilterProducts(brandOrders);
    if (fromOrders.length > 0) return fromOrders;
    return collectFilterProductsFromAssembly(
      syncedAssemblyItems.filter((item) => matchesStoreBrand(item.brand, selectedBrand)),
    );
  }, [brandOrders, syncedAssemblyItems, selectedBrand]);

  const offline = !isInternetOnline || !isServerReachable;

  const handleBrandChange = (brand: string) => {
    const next = brand.trim();
    if (!next || next === selectedBrand) return;
    noteClientAction(`brand-filter:${next}`);
    startFilterTransition(() => {
      setSelectedBrand(next);
      // «В наличии» оставляем как выбрал пользователь; остальное сбрасываем.
      setFilters((prev) => ({ ...DEFAULT_FILTERS, inStock: prev.inStock }));
    });
  };

  const handleFiltersChange = (next: OtpravkiFiltersState) => {
    startFilterTransition(() => {
      setFilters(next);
    });
  };

  const canResetCollected = useMemo(() => {
    if (Object.values(progress?.items ?? {}).some((entry) => entry.collectedCount > 0)) {
      return true;
    }
    return syncedAssemblyItems.some((item) => item.collectedCount > 0);
  }, [progress, syncedAssemblyItems]);

  const handleResetCollected = () => {
    if (resetCollectedBusy || !canResetCollected) return;
    const ok = window.confirm(
      "Обнулить все отметки «собрано» по всем брендам? Заказы в отправках снова скроются, пока их не соберут заново.",
    );
    if (!ok) return;

    const ids = new Set<string>();
    for (const [id, entry] of Object.entries(progress?.items ?? {})) {
      if (entry.collectedCount > 0) ids.add(id);
    }
    for (const item of syncedAssemblyItems) {
      if (item.collectedCount > 0) ids.add(item.id);
    }
    if (ids.size === 0) return;

    const patch = [...ids].map((id) => ({ id, collectedCount: 0 }));
    noteClientAction(`sborka:reset-collected:${patch.length}`);
    setResetCollectedBusy(true);
    setProgress((current) => ({
      revision: current?.revision ?? 0,
      updatedAt: Date.now(),
      updatedBy: "local",
      items: {},
    }));

    void pushAssemblyProgress(patch)
      .then((remote) => {
        if (remote) setProgress(remote);
      })
      .finally(() => setResetCollectedBusy(false));
  };

  return (
    <div
      className="otpravki-shell relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50 overscroll-none"
      data-no-drag-scroll
    >
      {reloading ? <StageLoadingScreen variant="overlay" /> : null}
      <OtpravkiPageHeader
        title="Сборка"
        subtitle={`${filteredAssemblyItems.length} поз. · ${filteredOrders.length} зак. · ${formatBrandLabel(selectedBrand)}`}
        hideNav
        onRefresh={() => {
          setReloading(true);
          noteClientAction(`refresh:${selectedBrand}`);
          // Полный sync всех брендов — не только выбранного
          void refreshFromApi(undefined).finally(() => setReloading(false));
        }}
        refreshing={reloading}
        offline={offline}
        offlineMessage={!isInternetOnline ? "Нет интернета" : "Сервер недоступен"}
      >
        <div data-no-drag-scroll className={filterPending ? "opacity-60" : undefined}>
          <OtpravkiMobileFilters
            filters={filters}
            onChange={handleFiltersChange}
            products={products}
            brandOptions={brandOptions}
            selectedBrand={selectedBrand}
            onBrandChange={handleBrandChange}
            brandDisabled={reloading}
            alwaysVisible
            collapsible
            defaultExpanded={false}
            showFromAssembly={false}
          />
        </div>
      </OtpravkiPageHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        <main className="sborka-scroll min-h-0 min-w-0 flex-1 overscroll-contain rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
          <AssemblyView
            sections={assemblySections}
            allItems={filteredAssemblyItems}
            orders={filteredOrders}
            urgencyOrders={brandOrders}
            onItemsChange={handleFilteredAssemblyChange}
            warehouseMap={warehouseMap}
            canResetCollected={canResetCollected}
            resetCollectedBusy={resetCollectedBusy}
            onResetCollected={handleResetCollected}
            showBrandMark={isAllBrands(selectedBrand)}
            onFindProduct={handleFindProduct}
            findProductIds={filters.productIds}
          />
        </main>
      </div>
    </div>
  );
}
