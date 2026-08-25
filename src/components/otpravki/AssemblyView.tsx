"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHardwareScanner } from "@/hooks/useHardwareScanner";
import type { AssemblyViewSections } from "@/lib/assembly-demand";
import {
  buildAssemblyUrgencyMap,
  resolveAssemblyItemUrgencyFromMap,
} from "@/lib/assembly-sort";
import { planAssemblyRoute } from "@/lib/assembly-route";
import { URGENCY_LABELS } from "@/lib/urgency";
import { resolveAssemblyScan } from "@/lib/barcode-product";
import {
  buildCellLocationIndex,
  findCellLocationInIndex,
  locationKey,
} from "@/lib/warehouse-location";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { AssemblyItemCard } from "./AssemblyItemCard";
import { AutoModeButton } from "./AutoModeButton";
import { BarcodeScanner } from "./BarcodeScanner";
import { BloggerBadge } from "./BloggerBadge";
import { BrandMark } from "./BrandMark";
import { ScanErrorPopup } from "./ScanErrorPopup";

interface AssemblyViewProps {
  sections: AssemblyViewSections;
  allItems: AssemblyItem[];
  orders: ShippingOrder[];
  /** Заказы для расчёта срочности на карточках (обычно все активные заказы бренда) */
  urgencyOrders?: ShippingOrder[];
  onItemCollectChange: (id: string, collectedCount: number, collectedAt?: number) => void;
  warehouseMap?: WarehouseMapConfig;
  /** Есть что обнулять по всем брендам */
  canResetCollected?: boolean;
  resetCollectedBusy?: boolean;
  onResetCollected?: () => void;
  showBrandMark?: boolean;
  /** Тап по фото — фильтр по товару (как «Вещи» в отправках) */
  onFindProduct?: (productId: string) => void;
  findProductIds?: readonly string[];
}

function totalUnits(sections: AssemblyViewSections) {
  const all = [...sections.pending, ...sections.completed];
  return all.reduce((sum, item) => sum + item.quantity, 0);
}

function collectedUnits(sections: AssemblyViewSections) {
  const all = [...sections.pending, ...sections.completed];
  return all.reduce((sum, item) => sum + item.collectedCount, 0);
}

function itemFromMap(map: Map<string, AssemblyItem>, id: string): AssemblyItem | undefined {
  return map.get(id);
}

const MemoAssemblyItemCard = memo(AssemblyItemCard);

/** Сколько SKU рисуем за раз — планшет не тянет сотни карточек. */
const PAGE_SIZE = 15;

export function AssemblyView({
  sections,
  allItems,
  orders,
  urgencyOrders,
  onItemCollectChange,
  warehouseMap,
  canResetCollected = false,
  resetCollectedBusy = false,
  onResetCollected,
  showBrandMark = false,
  onFindProduct,
  findProductIds = [],
}: AssemblyViewProps) {
  const allItemsById = useMemo(
    () => new Map(allItems.map((item) => [item.id, item])),
    [allItems],
  );
  const displayItemsById = useMemo(() => {
    const map = new Map<string, AssemblyItem>();
    for (const item of [...sections.pending, ...sections.completed]) {
      map.set(item.id, item);
    }
    return map;
  }, [sections.pending, sections.completed]);
  const allItemsByIdRef = useRef(allItemsById);
  const displayItemsByIdRef = useRef(displayItemsById);
  const currentItemRef = useRef<AssemblyItem | undefined>(undefined);
  const urgencySource = urgencyOrders ?? orders;
  const [autoMode, setAutoMode] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [navDismissedFor, setNavDismissedFor] = useState<string | null>(null);
  const [stepsDone, setStepsDone] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [visiblePendingCount, setVisiblePendingCount] = useState(PAGE_SIZE);
  const [visibleCompletedCount, setVisibleCompletedCount] = useState(PAGE_SIZE);
  /** Мгновенный UI на «Взял» — не ждём пересчёт родителя. */
  const [localCounts, setLocalCounts] = useState<Map<string, number>>(() => new Map());
  const totalStepsRef = useRef(0);
  const findProductKey = findProductIds.join("|");
  const totals = useMemo(
    () => ({
      units: totalUnits(sections),
      collected: collectedUnits(sections),
    }),
    [sections],
  );

  useEffect(() => {
    setVisiblePendingCount(PAGE_SIZE);
    setVisibleCompletedCount(PAGE_SIZE);
  }, [sections.pending.length, sections.completed.length, findProductKey]);

  useEffect(() => {
    setLocalCounts((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [id, count] of prev) {
        const item = allItemsById.get(id);
        if (!item || item.collectedCount === count) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allItemsById]);

  const withLocalCount = useCallback(
    (item: AssemblyItem): AssemblyItem => {
      const local = localCounts.get(item.id);
      if (local === undefined || local === item.collectedCount) return item;
      return { ...item, collectedCount: local };
    },
    [localCounts],
  );

  const route = useMemo(() => {
    if (!autoMode) return [];
    return planAssemblyRoute(allItems, orders, warehouseMap);
  }, [autoMode, allItems, orders, warehouseMap]);

  const pendingVisible = useMemo(
    () => sections.pending.slice(0, visiblePendingCount).map(withLocalCount),
    [sections.pending, visiblePendingCount, withLocalCount],
  );
  const completedVisible = useMemo(
    () => sections.completed.slice(0, visibleCompletedCount).map(withLocalCount),
    [sections.completed, visibleCompletedCount, withLocalCount],
  );
  const hasMorePending = sections.pending.length > visiblePendingCount;
  const hasMoreCompleted = sections.completed.length > visibleCompletedCount;

  const currentRouteItem = route[0];
  const currentItemRaw = currentRouteItem
    ? (displayItemsById.get(currentRouteItem.id) ??
      itemFromMap(allItemsById, currentRouteItem.id))
    : undefined;
  const currentItem = currentItemRaw ? withLocalCount(currentItemRaw) : undefined;
  allItemsByIdRef.current = allItemsById;
  displayItemsByIdRef.current = displayItemsById;
  currentItemRef.current = currentItem;

  const visibleForMeta = useMemo(() => {
    const list: AssemblyItem[] = [...pendingVisible, ...completedVisible];
    if (currentItem && !list.some((row) => row.id === currentItem.id)) {
      list.push(currentItem);
    }
    if (autoMode) {
      for (const row of route.slice(0, PAGE_SIZE + 1)) {
        if (!list.some((item) => item.id === row.id)) list.push(row);
      }
    }
    return list;
  }, [pendingVisible, completedVisible, currentItem, autoMode, route]);

  // Срочность — только видимые карточки; ячейки в AUTO — по всему маршруту (группа ячейки).
  const urgencyMap = useMemo(
    () => buildAssemblyUrgencyMap(urgencySource),
    [urgencySource],
  );
  const urgencyByItemId = useMemo(() => {
    const map = new Map<string, { label: string; className: string }>();
    for (const item of visibleForMeta) {
      map.set(
        item.id,
        URGENCY_LABELS[resolveAssemblyItemUrgencyFromMap(item, urgencyMap)],
      );
    }
    return map;
  }, [visibleForMeta, urgencyMap]);
  const locationByItemId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findCellLocationInIndex>>();
    if (!warehouseMap) return map;
    const index = buildCellLocationIndex(warehouseMap);
    const source = autoMode ? [...route, ...completedVisible] : visibleForMeta;
    const seen = new Set<string>();
    for (const item of source) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const loc = findCellLocationInIndex(item, index);
      if (loc) map.set(item.id, loc);
    }
    return map;
  }, [autoMode, route, completedVisible, visibleForMeta, warehouseMap]);
  const findProductSet = useMemo(() => new Set(findProductIds), [findProductIds]);
  const currentLocation = currentItem ? locationByItemId.get(currentItem.id) : undefined;
  const currentLocationKey = currentLocation ? locationKey(currentLocation) : null;

  const locationGroup = useMemo(() => {
    if (!currentLocationKey || !warehouseMap) return [];

    return route
      .map((routeItem) => itemFromMap(allItemsById, routeItem.id) ?? routeItem)
      .filter((item) => {
        const loc = locationByItemId.get(item.id);
        return loc && locationKey(loc) === currentLocationKey;
      })
      .map((item) => ({
        id: item.id,
        productName: item.productName,
        size: item.size,
        isBlogger: item.isBlogger === true,
        isCurrent: item.id === currentItem?.id,
        isComplete: item.collectedCount >= item.quantity,
      }));
  }, [route, allItemsById, warehouseMap, currentLocationKey, currentItem?.id, locationByItemId]);

  const locationGroupIndex = locationGroup.findIndex((entry) => entry.isCurrent) + 1;

  const setCollectedCount = useCallback(
    (targetId: string, nextCount: number) => {
      const clamped = Math.max(0, nextCount);
      setLocalCounts((prev) => {
        const next = new Map(prev);
        next.set(targetId, clamped);
        return next;
      });
      onItemCollectChange(
        targetId,
        clamped,
        clamped > 0 ? Date.now() : undefined,
      );
    },
    [onItemCollectChange],
  );

  const exitAutoMode = useCallback(() => {
    setAutoMode(false);
    setNavOpen(false);
    setNavDismissedFor(null);
    setStepsDone(0);
    totalStepsRef.current = 0;
  }, []);

  const advanceRoute = useCallback((keepNavOpen = false) => {
    if (!keepNavOpen) setNavOpen(false);
    setNavDismissedFor(null);
    setStepsDone((n) => n + 1);
  }, []);

  const handleNavOpenChange = useCallback(
    (open: boolean) => {
      setNavOpen(open);
      if (!open && autoMode && currentItem) {
        setNavDismissedFor(currentItem.id);
      } else if (open) {
        setNavDismissedFor(null);
      }
    },
    [autoMode, currentItem?.id],
  );

  const handleAutoModeToggle = useCallback(() => {
    if (autoMode) {
      exitAutoMode();
      return;
    }
    const planned = planAssemblyRoute(allItems, orders, warehouseMap);
    totalStepsRef.current = planned.length;
    setStepsDone(0);
    setNavDismissedFor(null);
    setAutoMode(true);
    setNavOpen(true);
  }, [autoMode, exitAutoMode, allItems, orders, warehouseMap]);

  useEffect(() => {
    if (!autoMode) return;
    if (!currentItem) return;
    if (!currentLocationKey) return;
    if (navDismissedFor === currentItem.id) return;
    setNavOpen(true);
  }, [autoMode, currentItem?.id, currentLocationKey, navDismissedFor]);

  useEffect(() => {
    if (!autoMode) return;
    if (route.length === 0) {
      exitAutoMode();
    }
  }, [autoMode, route.length, exitAutoMode]);

  const applyCollect = useCallback(
    (targetId: string) => {
      const raw =
        displayItemsByIdRef.current.get(targetId) ?? allItemsByIdRef.current.get(targetId);
      if (!raw) return false;
      const visible = withLocalCount(raw);
      if (visible.collectedCount >= visible.quantity) return false;

      const willComplete = visible.collectedCount + 1 >= visible.quantity;
      const isCurrent = autoMode && currentItemRef.current?.id === targetId;
      const hasNext = route.length > 1;
      const nextRouteItem = route.length > 1 ? route[1] : undefined;
      const nextItem = nextRouteItem ? allItemsByIdRef.current.get(nextRouteItem.id) : undefined;
      const nextLocation = nextItem ? locationByItemId.get(nextItem.id) : undefined;
      const nextLocationKey = nextLocation ? locationKey(nextLocation) : null;
      const stayAtLocation =
        isCurrent &&
        willComplete &&
        hasNext &&
        Boolean(currentLocationKey && nextLocationKey === currentLocationKey);

      setCollectedCount(targetId, visible.collectedCount + 1);

      if (isCurrent && willComplete) {
        if (hasNext) {
          advanceRoute(stayAtLocation);
        } else {
          exitAutoMode();
        }
      }

      return true;
    },
    [
      autoMode,
      route,
      locationByItemId,
      currentLocationKey,
      setCollectedCount,
      advanceRoute,
      exitAutoMode,
      withLocalCount,
    ],
  );

  const handleTake = useCallback(() => {
    if (!autoMode || !currentItem) return;
    applyCollect(currentItem.id);
  }, [autoMode, currentItem, applyCollect]);

  const handleIncrement = useCallback(
    (id: string) => {
      if (autoMode && currentItemRef.current && id !== currentItemRef.current.id) return;
      applyCollect(id);
    },
    [autoMode, applyCollect],
  );

  const handleDecrement = useCallback(
    (id: string) => {
      if (autoMode) return;
      const item =
        displayItemsByIdRef.current.get(id) ?? allItemsByIdRef.current.get(id);
      if (!item || item.collectedCount <= 0) return;
      setCollectedCount(id, item.collectedCount - 1);
    },
    [autoMode, setCollectedCount],
  );

  const canScan = sections.pending.length > 0 || (autoMode && Boolean(currentItem));

  const validateScan = useCallback(
    (code: string) => {
      if (!canScan) return;

      const result = resolveAssemblyScan(allItems, code, {
        onlyItemId: autoMode ? currentItem?.id : undefined,
      });
      if (!result.ok) {
        setScanError(result.message);
        return;
      }

      const applied = applyCollect(result.item.id);
      if (!applied) {
        setScanError("Все единицы этой позиции уже собраны");
        return;
      }

      setScanError(null);
      setScannerOpen(false);
    },
    [canScan, allItems, autoMode, currentItem?.id, applyCollect],
  );

  useHardwareScanner(validateScan, !scannerOpen && canScan);

  const isEmpty = sections.pending.length === 0 && sections.completed.length === 0;
  const routeStepById = useMemo(() => {
    const map = new Map<string, number>();
    route.forEach((item, index) => map.set(item.id, index + 1));
    return map;
  }, [route]);

  const upcomingRoute = route.slice(1, 1 + PAGE_SIZE);
  const upcomingHidden = Math.max(0, route.length - 1 - upcomingRoute.length);
  const stepNumber = stepsDone + 1;
  const totalSteps = totalStepsRef.current || route.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 sm:text-lg">Позиции на сегодня</h2>
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
              {autoMode
                ? "AUTO MODE: сканируйте текущую позицию или нажмите «Взял»"
                : "Сканируйте штрихкод или отмечайте вручную"}
            </p>
          </div>
          {(canResetCollected || !isEmpty || findProductIds.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 self-start">
              {findProductIds.length > 0 && onFindProduct ? (
                <button
                  type="button"
                  data-no-drag-scroll
                  onClick={() => {
                    const id = findProductIds[0];
                    if (id) onFindProduct(id);
                  }}
                  className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-sm font-medium text-violet-800 active:bg-violet-100"
                >
                  Фильтр по фото
                  <span aria-hidden className="text-violet-500">
                    ×
                  </span>
                </button>
              ) : null}
              {canResetCollected && onResetCollected ? (
                <button
                  type="button"
                  data-no-drag-scroll
                  onClick={onResetCollected}
                  disabled={resetCollectedBusy}
                  className="inline-flex min-h-11 touch-manipulation items-center rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-700 active:bg-red-50 disabled:opacity-40"
                >
                  {resetCollectedBusy ? "Обнуляю…" : "Обнулить собранные"}
                </button>
              ) : null}
              {!isEmpty ? (
                <>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    disabled={!canScan}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 active:bg-gray-50 disabled:opacity-40"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Сканер
                  </button>
                  <div className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold tabular-nums text-gray-700">
                    {totals.collected} / {totals.units}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>

        {!isEmpty && (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <AutoModeButton
              active={autoMode}
              onClick={handleAutoModeToggle}
              title="AUTO MODE"
              subtitleActive="Маршрут → карта → сканер / Взял"
              subtitleInactive="Оптимальный порядок сборки по карте склада"
            />
          </div>
        )}
      </div>

      {autoMode && route.length > 0 && currentItem && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span className="font-semibold text-gray-900">
            Шаг {stepNumber} / {totalSteps}
          </span>
          {locationGroup.length > 1 && currentLocation && (
            <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              С этой ячейки · {locationGroupIndex}/{locationGroup.length}
            </span>
          )}
          {currentItem.isBlogger && <BloggerBadge />}
          {showBrandMark ? <BrandMark brand={currentItem.brand} size="md" /> : null}
          {currentLocation && (
            <span className="text-gray-600">→ {currentLocation.hint}</span>
          )}
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">Всё собрано</p>
          <p className="mt-1 text-xs text-gray-500">Новые позиции появятся с неотправленными заказами</p>
        </div>
      ) : autoMode && route.length > 0 ? (
        <div className="space-y-4">
          {currentItem && (
            <MemoAssemblyItemCard
              item={currentItem}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              cellLocation={currentLocation}
              warehouseMap={warehouseMap}
              emphasize
              stepNumber={stepNumber}
              navOpen={navOpen}
              onNavOpenChange={handleNavOpenChange}
              onAutoTake={handleTake}
              locationGroup={locationGroup.length > 1 ? locationGroup : undefined}
              locationGroupIndex={locationGroupIndex}
              showBrandMark={showBrandMark}
              onFindProduct={onFindProduct}
              findActive={Boolean(
                currentItem.productId && findProductSet.has(currentItem.productId),
              )}
              urgency={urgencyByItemId.get(currentItem.id)}
            />
          )}

          {upcomingRoute.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                Дальше по маршруту
              </p>
              <div className="grid gap-2">
                {upcomingRoute.map((item) => {
                  const fresh = itemFromMap(allItemsById, item.id) ?? item;
                  return (
                    <MemoAssemblyItemCard
                      key={item.id}
                      item={fresh}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      cellLocation={locationByItemId.get(fresh.id)}
                      dimmed
                      locked
                      stepNumber={routeStepById.get(item.id)}
                      showBrandMark={showBrandMark}
                      onFindProduct={onFindProduct}
                      findActive={Boolean(item.productId && findProductSet.has(item.productId))}
                      urgency={urgencyByItemId.get(fresh.id)}
                    />
                  );
                })}
                {upcomingHidden > 0 ? (
                  <p className="px-1 text-xs text-gray-400">ещё {upcomingHidden} по маршруту…</p>
                ) : null}
              </div>
            </div>
          )}

          {sections.completed.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center gap-3 px-1">
                <p className="text-xs font-medium uppercase tracking-wide text-green-700">Собрано</p>
                <div className="h-px flex-1 bg-green-200" />
              </div>
              <div className="grid gap-2.5 sm:gap-3">
                {completedVisible.map((item) => (
                  <MemoAssemblyItemCard
                    key={item.id}
                    item={item}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    cellLocation={locationByItemId.get(item.id)}
                    dimmed
                    locked
                    showBrandMark={showBrandMark}
                    onFindProduct={onFindProduct}
                    findActive={Boolean(item.productId && findProductSet.has(item.productId))}
                    urgency={urgencyByItemId.get(item.id)}
                  />
                ))}
                {hasMoreCompleted ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCompletedCount((n) => n + PAGE_SIZE)}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 active:bg-gray-50"
                  >
                    Показать собранные ({sections.completed.length - visibleCompletedCount})
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sections.pending.length > 0 && (
            <div className="grid gap-2.5 sm:gap-3">
              {pendingVisible.map((item) => (
                <MemoAssemblyItemCard
                  key={item.id}
                  item={item}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  cellLocation={locationByItemId.get(item.id)}
                  warehouseMap={warehouseMap}
                  showBrandMark={showBrandMark}
                  onFindProduct={onFindProduct}
                  findActive={Boolean(item.productId && findProductSet.has(item.productId))}
                  urgency={urgencyByItemId.get(item.id)}
                />
              ))}
              {hasMorePending ? (
                <button
                  type="button"
                  onClick={() => setVisiblePendingCount((n) => n + PAGE_SIZE)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 active:bg-gray-50"
                >
                  Показать ещё ({sections.pending.length - visiblePendingCount})
                </button>
              ) : null}
            </div>
          )}

          {sections.completed.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center gap-3 px-1">
                <p className="text-xs font-medium uppercase tracking-wide text-green-700">Собрано</p>
                <div className="h-px flex-1 bg-green-200" />
              </div>
              <div className="grid gap-2.5 sm:gap-3">
                {completedVisible.map((item) => (
                  <MemoAssemblyItemCard
                    key={item.id}
                    item={item}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    cellLocation={locationByItemId.get(item.id)}
                    showBrandMark={showBrandMark}
                    onFindProduct={onFindProduct}
                    findActive={Boolean(item.productId && findProductSet.has(item.productId))}
                    urgency={urgencyByItemId.get(item.id)}
                  />
                ))}
                {hasMoreCompleted ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCompletedCount((n) => n + PAGE_SIZE)}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 active:bg-gray-50"
                  >
                    Показать собранные ({sections.completed.length - visibleCompletedCount})
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {scannerOpen && (
        <BarcodeScanner onScan={validateScan} onClose={() => setScannerOpen(false)} />
      )}

      {scanError && <ScanErrorPopup message={scanError} onClose={() => setScanError(null)} />}
    </div>
  );
}
