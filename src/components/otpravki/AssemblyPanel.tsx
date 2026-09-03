"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StageLoadingScreen } from "@/components/ui/StageLoadingScreen";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import { useWorkspace } from "@/hooks/useWorkspace";
import { noteClientAction } from "@/lib/client-diag";
import { ORDERS_API_POLL_MS } from "@/lib/orders-sync";
import {
  applyProgressToItems,
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
import { useConfiguredBrands } from "@/hooks/useConfiguredBrands";
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
  /** Холодный старт без кэша — сразу тянем Casher, не ждём 15с */
  syncImmediately?: boolean;
}

function getOrderStoreBrand(order: ShippingOrder): string {
  return getStoreBrand(order.storeBrand);
}

export function AssemblyPanel({
  assemblyItems: initialAssembly,
  orders: initialOrders,
  apiOrderIds: initialApiOrderIds = [],
  shippedArchive: initialShippedArchive = [],
  initialRevision = 0,
  warehouseMap: warehouseMapProp,
  syncImmediately = false,
}: AssemblyPanelProps) {
  const configuredBrands = useConfiguredBrands();
  const [selectedBrand, setSelectedBrand] = useState<string>(ALL_BRANDS);
  // Сборка: не режем «только в наличии» — иначе пропадают SKU из неготовых заказов (майка и т.п.).
  const [filters, setFilters] = useState<OtpravkiFiltersState>({
    ...DEFAULT_FILTERS,
    inStock: false,
    fromAssembly: false,
  });
  const [reloading, setReloading] = useState(false);
  const [progress, setProgress] = useState<AssemblyProgressState | null>(null);
  const [resetCollectedBusy, setResetCollectedBusy] = useState(false);
  const [warehouseMap, setWarehouseMap] = useState<WarehouseMapConfig | undefined>(warehouseMapProp);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const lastInteractionRef = useRef(0);

  const pushTimerRef = useRef<number | undefined>(undefined);
  const pendingPatchRef = useRef(
    new Map<string, { id: string; collectedCount: number; collectedAt?: number }>(),
  );

  const noteInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  const mergeRemoteProgress = useCallback(
    (current: AssemblyProgressState | null, remote: AssemblyProgressState): AssemblyProgressState => {
      if (!current) return remote;
      if (pendingPatchRef.current.size > 0) {
        const mergedItems = { ...remote.items };
        for (const [id, entry] of Object.entries(current.items)) {
          const remoteEntry = mergedItems[id];
          if (!remoteEntry || entry.collectedCount > remoteEntry.collectedCount) {
            mergedItems[id] = entry;
          }
        }
        return {
          ...remote,
          items: mergedItems,
          updatedBy: current.updatedBy,
          updatedAt: Math.max(remote.updatedAt, current.updatedAt),
          revision: Math.max(remote.revision, current.revision),
        };
      }
      if (remote.revision < current.revision) return current;
      if (
        remote.revision === current.revision &&
        current.updatedBy === "local" &&
        remote.updatedAt <= current.updatedAt
      ) {
        return current;
      }
      return remote;
    },
    [],
  );

  const flushProgressPatch = useCallback(() => {
    const patch = [...pendingPatchRef.current.values()];
    if (patch.length === 0) return;
    void pushAssemblyProgress(patch).then((remote) => {
      for (const row of patch) {
        const pending = pendingPatchRef.current.get(row.id);
        if (pending && pending.collectedCount === row.collectedCount) {
          pendingPatchRef.current.delete(row.id);
        }
      }
      if (!remote) return;
      setProgress((current) => mergeRemoteProgress(current, remote));
    });
  }, [mergeRemoteProgress]);

  useEffect(() => {
    return () => {
      if (pushTimerRef.current !== undefined) {
        window.clearTimeout(pushTimerRef.current);
      }
      flushProgressPatch();
    };
  }, [flushProgressPatch]);

  useEffect(() => {
    if (warehouseMapProp) {
      setWarehouseMap(warehouseMapProp);
      return;
    }
    let cancelled = false;
    // Карта склада не блокирует первый кадр списка.
    const timer = window.setTimeout(() => {
      void fetch("/api/warehouse-map", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { data?: WarehouseMapConfig } | null) => {
          if (cancelled) return;
          setWarehouseMap(data?.data ?? { furniture: [], updatedAt: 0 });
        })
        .catch(() => {
          if (!cancelled) setWarehouseMap({ furniture: [], updatedAt: 0 });
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [warehouseMapProp]);

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
    slimForAssembly: true,
  });

  useOtpravkiNoSwipe("tablet");

  // Полный pull Casher — не на полоске загрузки; сразу только если кэш пустой.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const run = () => {
      if (cancelled || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (Date.now() - lastInteractionRef.current < 12_000) return;
      noteClientAction("sborka:sync");
      void refreshFromApi(undefined, { silent: true });
    };

    const firstDelayMs = syncImmediately ? 400 : 15_000;
    const startTimer = window.setTimeout(() => {
      run();
      timer = window.setInterval(run, Math.max(ORDERS_API_POLL_MS, 90_000));
    }, firstDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [refreshFromApi, syncImmediately]);

  useEffect(() => {
    let cancelled = false;
    void fetchAssemblyProgress().then((next) => {
      if (!cancelled && next) setProgress(next);
    });
    const unsub = subscribeAssemblyProgress({
      query: { slim: "assembly" },
      onProgress: (next) => {
        setProgress((current) => mergeRemoteProgress(current, next));
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [mergeRemoteProgress]);

  // После отгрузки спрос падает — чистим «собрано» по исчезнувшим/урезанным позициям.
  useEffect(() => {
    const patch = staleAssemblyProgressPatch(assemblyItems, progressRef.current);
    if (patch.length === 0) return;
    let cancelled = false;
    void pushAssemblyProgress(patch).then((remote) => {
      if (!cancelled && remote) {
        setProgress((current) => mergeRemoteProgress(current, remote));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assemblyItems, mergeRemoteProgress]);

  const brandOrders = useMemo(
    () =>
      orders.filter(
        (order) => matchesStoreBrand(order.storeBrand, selectedBrand) && !order.barcodePrinted,
      ),
    [orders, selectedBrand],
  );

  /** Только заказы, которые можно отправить (всё в наличии на складе). */
  const stockOrders = useMemo(
    () => brandOrders.filter((order) => order.ready !== false),
    [brandOrders],
  );

  const filteredOrders = useMemo(
    () =>
      applyOrderFilters(stockOrders, {
        ...filters,
        scan: "all",
        inStock: false,
        fromAssembly: false,
      }),
    [stockOrders, filters],
  );

  const filteredAssemblyBase = useMemo(() => {
    const stockKeys = new Set(
      stockOrders.flatMap((order) =>
        order.items.map(
          (item) => `${item.productId}-${item.sizeId}-${orderIsBlogger(order)}`,
        ),
      ),
    );

    let brandAsm = assemblyItems.filter(
      (item) =>
        matchesStoreBrand(item.brand, selectedBrand) &&
        item.quantity > 0 &&
        stockKeys.has(`${item.productId}-${item.sizeId}-${item.isBlogger === true}`),
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
  }, [assemblyItems, selectedBrand, filters, stockOrders, filteredOrders]);

  // Тяжёлый enrich+sort — только когда сменился состав позиций, НЕ на каждый «Взял».
  const assemblySectionsBase = useMemo(
    () => getAssemblyViewSections(filteredAssemblyBase, stockOrders, false, undefined, stockOrders),
    [filteredAssemblyBase, stockOrders],
  );

  const filteredAssemblyItems = useMemo(
    () => applyProgressToItems(filteredAssemblyBase, progress),
    [filteredAssemblyBase, progress],
  );

  const assemblySections = useMemo(
    () => ({
      pending: applyProgressToItems(assemblySectionsBase.pending, progress),
      completed: applyProgressToItems(assemblySectionsBase.completed, progress),
    }),
    [assemblySectionsBase, progress],
  );

  const handleItemCollectChange = useCallback(
    (id: string, collectedCount: number, collectedAt?: number) => {
      noteInteraction();
      setProgress((current) => {
        const items = { ...(current?.items ?? {}) };
        if (collectedCount <= 0) delete items[id];
        else items[id] = { collectedCount, collectedAt };
        return {
          revision: (current?.revision ?? 0) + 1,
          updatedAt: Date.now(),
          updatedBy: "local",
          items,
        };
      });
      pendingPatchRef.current.set(id, { id, collectedCount, collectedAt });
      if (pushTimerRef.current !== undefined) {
        window.clearTimeout(pushTimerRef.current);
      }
      // Чуть дольше батчим тапы — UI уже обновлён локально.
      pushTimerRef.current = window.setTimeout(() => {
        pushTimerRef.current = undefined;
        flushProgressPatch();
      }, 280);
    },
    [noteInteraction, flushProgressPatch],
  );

  const brandOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ALL_BRANDS,
          ...configuredBrands,
          ...orders.map((order) => getOrderStoreBrand(order)),
        ]),
      ),
    [orders, configuredBrands],
  );

  const products = useMemo(() => {
    // «Вещи» только из заказов в наличии (ready).
    const byId = new Map<string, ReturnType<typeof collectFilterProducts>[number]>();
    for (const row of collectFilterProducts(stockOrders)) {
      byId.set(row.productId, row);
    }
    for (const row of collectFilterProductsFromAssembly(filteredAssemblyBase)) {
      const prev = byId.get(row.productId);
      if (!prev) {
        byId.set(row.productId, row);
        continue;
      }
      byId.set(row.productId, {
        ...prev,
        productName: prev.productName || row.productName,
        imageUrl: prev.imageUrl || row.imageUrl,
        quantity: Math.max(prev.quantity, row.quantity),
        orderCount: Math.max(prev.orderCount, row.orderCount),
      });
    }
    return [...byId.values()].sort((a, b) => a.productName.localeCompare(b.productName, "ru"));
  }, [stockOrders, filteredAssemblyBase]);

  const offline = !isInternetOnline || !isServerReachable;

  const handleBrandChange = (brand: string) => {
    const next = brand.trim();
    if (!next || next === selectedBrand) return;
    noteClientAction(`brand-filter:${next}`);
    setSelectedBrand(next);
    setFilters((prev) => ({
      ...DEFAULT_FILTERS,
      inStock: false,
      fromAssembly: false,
      // сохраняем выбранные вещи только если бренд тот же — при смене бренда сброс
    }));
  };

  const handleFiltersChange = (next: OtpravkiFiltersState) => {
    setFilters({ ...next, inStock: false, fromAssembly: false });
  };

  const canResetCollected = useMemo(
    () => Object.values(progress?.items ?? {}).some((entry) => entry.collectedCount > 0),
    [progress],
  );

  const handleResetCollected = () => {
    if (resetCollectedBusy || !canResetCollected) return;
    const ok = window.confirm(
      "Обнулить все отметки «собрано» по всем брендам? Заказы в отправках снова скроются, пока их не соберут заново.",
    );
    if (!ok) return;

    const ids = Object.entries(progress?.items ?? {})
      .filter(([, entry]) => entry.collectedCount > 0)
      .map(([id]) => id);
    if (ids.length === 0) return;

    const patch = ids.map((id) => ({ id, collectedCount: 0 }));
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
        <div data-no-drag-scroll>
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
            showInStock={false}
          />
        </div>
      </OtpravkiPageHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        <main className="sborka-scroll min-h-0 min-w-0 flex-1 overscroll-contain rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
          <AssemblyView
            sections={assemblySections}
            allItems={filteredAssemblyItems}
            orders={filteredOrders}
            urgencyOrders={stockOrders}
            onItemCollectChange={handleItemCollectChange}
            warehouseMap={warehouseMap}
            canResetCollected={canResetCollected}
            resetCollectedBusy={resetCollectedBusy}
            onResetCollected={handleResetCollected}
            showBrandMark={isAllBrands(selectedBrand)}
          />
        </main>
      </div>
    </div>
  );
}
