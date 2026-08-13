"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHardwareScanner } from "@/hooks/useHardwareScanner";
import type { AssemblyViewSections } from "@/lib/assembly-demand";
import { planAssemblyRoute } from "@/lib/assembly-route";
import { resolveAssemblyScan } from "@/lib/barcode-product";
import { findCellLocation, locationKey } from "@/lib/warehouse-location";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { AssemblyItemCard } from "./AssemblyItemCard";
import { AutoModeButton } from "./AutoModeButton";
import { BarcodeScanner } from "./BarcodeScanner";
import { BloggerBadge } from "./BloggerBadge";
import { ScanErrorPopup } from "./ScanErrorPopup";

interface AssemblyViewProps {
  sections: AssemblyViewSections;
  allItems: AssemblyItem[];
  orders: ShippingOrder[];
  onItemsChange: (items: AssemblyItem[]) => void;
  warehouseMap?: WarehouseMapConfig;
}

function totalUnits(sections: AssemblyViewSections) {
  const all = [...sections.pending, ...sections.completed];
  return all.reduce((sum, item) => sum + item.quantity, 0);
}

function collectedUnits(sections: AssemblyViewSections) {
  const all = [...sections.pending, ...sections.completed];
  return all.reduce((sum, item) => sum + item.collectedCount, 0);
}

function itemFromAll(allItems: AssemblyItem[], id: string): AssemblyItem | undefined {
  return allItems.find((item) => item.id === id);
}

export function AssemblyView({
  sections,
  allItems,
  orders,
  onItemsChange,
  warehouseMap,
}: AssemblyViewProps) {
  const visibleItems = [...sections.pending, ...sections.completed];
  const [autoMode, setAutoMode] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [navDismissedFor, setNavDismissedFor] = useState<string | null>(null);
  const [stepsDone, setStepsDone] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const totalStepsRef = useRef(0);

  const route = useMemo(
    () => planAssemblyRoute(allItems, orders, warehouseMap),
    [allItems, orders, warehouseMap],
  );

  const currentRouteItem = route[0];
  const currentItem = currentRouteItem ? itemFromAll(allItems, currentRouteItem.id) : undefined;
  const currentLocation = useMemo(
    () => (currentItem && warehouseMap ? findCellLocation(currentItem, warehouseMap) : undefined),
    [currentItem, warehouseMap],
  );
  const currentLocationKey = currentLocation ? locationKey(currentLocation) : null;

  const locationGroup = useMemo(() => {
    if (!currentLocationKey || !warehouseMap) return [];

    return route
      .map((routeItem) => itemFromAll(allItems, routeItem.id) ?? routeItem)
      .filter((item) => {
        const loc = findCellLocation(item, warehouseMap);
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
  }, [route, allItems, warehouseMap, currentLocationKey, currentItem?.id]);

  const locationGroupIndex = locationGroup.findIndex((entry) => entry.isCurrent) + 1;

  const findVisibleItem = useCallback(
    (id: string) => visibleItems.find((item) => item.id === id),
    [visibleItems],
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
    totalStepsRef.current = route.length;
    setStepsDone(0);
    setNavDismissedFor(null);
    setAutoMode(true);
    setNavOpen(true);
  }, [autoMode, exitAutoMode, route.length]);

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
      const visible = findVisibleItem(targetId) ?? itemFromAll(allItems, targetId);
      if (!visible || visible.collectedCount >= visible.quantity) return false;

      const willComplete = visible.collectedCount + 1 >= visible.quantity;
      const isCurrent = autoMode && currentItem?.id === targetId;
      const hasNext = route.length > 1;
      const nextRouteItem = route.length > 1 ? route[1] : undefined;
      const nextItem = nextRouteItem ? itemFromAll(allItems, nextRouteItem.id) : undefined;
      const nextLocation =
        nextItem && warehouseMap ? findCellLocation(nextItem, warehouseMap) : undefined;
      const nextLocationKey = nextLocation ? locationKey(nextLocation) : null;
      const stayAtLocation =
        isCurrent &&
        willComplete &&
        hasNext &&
        Boolean(currentLocationKey && nextLocationKey === currentLocationKey);

      onItemsChange(
        allItems.map((item) =>
          item.id === targetId && item.collectedCount < visible.quantity
            ? { ...item, collectedCount: item.collectedCount + 1, collectedAt: Date.now() }
            : item,
        ),
      );

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
      findVisibleItem,
      allItems,
      autoMode,
      currentItem,
      route,
      warehouseMap,
      currentLocationKey,
      onItemsChange,
      advanceRoute,
      exitAutoMode,
    ],
  );

  const handleTake = useCallback(() => {
    if (!autoMode || !currentItem) return;
    applyCollect(currentItem.id);
  }, [autoMode, currentItem, applyCollect]);

  const handleIncrement = useCallback(
    (id: string) => {
      if (autoMode && currentItem && id !== currentItem.id) return;
      applyCollect(id);
    },
    [autoMode, currentItem, applyCollect],
  );

  const handleDecrement = useCallback(
    (id: string) => {
      if (autoMode) return;
      onItemsChange(
        allItems.map((item) =>
          item.id === id && item.collectedCount > 0
            ? { ...item, collectedCount: item.collectedCount - 1, collectedAt: Date.now() }
            : item,
        ),
      );
    },
    [allItems, onItemsChange, autoMode],
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

  const upcomingRoute = route.slice(1);
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
          {!isEmpty && (
            <div className="flex items-center gap-2 self-start">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                disabled={!canScan}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 disabled:opacity-40"
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
                {collectedUnits(sections)} / {totalUnits(sections)}
              </div>
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
            <AssemblyItemCard
              key={currentItem.id}
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
            />
          )}

          {upcomingRoute.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                Дальше по маршруту
              </p>
              <div className="grid gap-2">
                {upcomingRoute.map((item) => {
                  const fresh = itemFromAll(allItems, item.id) ?? item;
                  const loc = warehouseMap ? findCellLocation(fresh, warehouseMap) : undefined;
                  return (
                    <AssemblyItemCard
                      key={item.id}
                      item={fresh}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      cellLocation={loc}
                      warehouseMap={warehouseMap}
                      dimmed
                      locked
                      stepNumber={routeStepById.get(item.id)}
                    />
                  );
                })}
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
                {sections.completed.map((item) => (
                  <AssemblyItemCard
                    key={item.id}
                    item={item}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    cellLocation={warehouseMap ? findCellLocation(item, warehouseMap) : undefined}
                    warehouseMap={warehouseMap}
                    dimmed
                    locked
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sections.pending.length > 0 && (
            <div className="grid gap-2.5 sm:gap-3">
              {sections.pending.map((item) => (
                <AssemblyItemCard
                  key={item.id}
                  item={item}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  cellLocation={warehouseMap ? findCellLocation(item, warehouseMap) : undefined}
                  warehouseMap={warehouseMap}
                />
              ))}
            </div>
          )}

          {sections.completed.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center gap-3 px-1">
                <p className="text-xs font-medium uppercase tracking-wide text-green-700">Собрано</p>
                <div className="h-px flex-1 bg-green-200" />
              </div>
              <div className="grid gap-2.5 sm:gap-3">
                {sections.completed.map((item) => (
                  <AssemblyItemCard
                    key={item.id}
                    item={item}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    cellLocation={warehouseMap ? findCellLocation(item, warehouseMap) : undefined}
                    warehouseMap={warehouseMap}
                  />
                ))}
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
