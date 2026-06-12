"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssemblyViewSections } from "@/lib/assembly-demand";
import { planAssemblyRoute } from "@/lib/assembly-route";
import { findCellLocation, locationKey } from "@/lib/warehouse-location";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { AssemblyItemCard } from "./AssemblyItemCard";
import { AutoModeButton } from "./AutoModeButton";
import { BloggerBadge } from "./BloggerBadge";

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

  const handleTake = useCallback(() => {
    if (!autoMode || !currentItem) return;

    const visible = findVisibleItem(currentItem.id);
    if (!visible || visible.collectedCount >= visible.quantity) return;

    const willComplete = visible.collectedCount + 1 >= visible.quantity;
    const hasNext = route.length > 1;
    const nextRouteItem = route.length > 1 ? route[1] : undefined;
    const nextItem = nextRouteItem ? itemFromAll(allItems, nextRouteItem.id) : undefined;
    const nextLocation = nextItem && warehouseMap ? findCellLocation(nextItem, warehouseMap) : undefined;
    const nextLocationKey = nextLocation ? locationKey(nextLocation) : null;
    const stayAtLocation =
      willComplete && hasNext && Boolean(currentLocationKey && nextLocationKey === currentLocationKey);

    onItemsChange(
      allItems.map((item) =>
        item.id === currentItem.id && item.collectedCount < visible.quantity
          ? { ...item, collectedCount: item.collectedCount + 1, collectedAt: Date.now() }
          : item,
      ),
    );

    if (willComplete) {
      if (hasNext) {
        advanceRoute(stayAtLocation);
      } else {
        exitAutoMode();
      }
    }
  }, [
    autoMode,
    currentItem,
    findVisibleItem,
    allItems,
    onItemsChange,
    route,
    warehouseMap,
    currentLocationKey,
    advanceRoute,
    exitAutoMode,
  ]);

  const handleIncrement = useCallback(
    (id: string) => {
      const visible = findVisibleItem(id);
      if (!visible) return;
      if (autoMode && currentItem && id !== currentItem.id) return;

      onItemsChange(
        allItems.map((item) =>
          item.id === id && item.collectedCount < visible.quantity
            ? { ...item, collectedCount: item.collectedCount + 1, collectedAt: Date.now() }
            : item,
        ),
      );
    },
    [allItems, findVisibleItem, onItemsChange, autoMode, currentItem],
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
                ? "AUTO MODE: маршрут по складу от ближайшей позиции"
                : "Собранные позиции уходят вниз после переключения вкладки"}
            </p>
          </div>
          {!isEmpty && (
            <div className="self-start rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold tabular-nums text-gray-700">
              {collectedUnits(sections)} / {totalUnits(sections)}
            </div>
          )}
        </div>

        {!isEmpty && (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <AutoModeButton
              active={autoMode}
              onClick={handleAutoModeToggle}
              title="AUTO MODE"
              subtitleActive="Маршрут → карта → следующая позиция"
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
    </div>
  );
}
