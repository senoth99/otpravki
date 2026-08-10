"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { computeCompletedAssemblyIds, getAssemblyViewSections } from "@/lib/assembly-demand";
import type { AssemblyItem, ShippingOrder, ShippingTab } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { ArchiveView } from "./ArchiveView";
import { AssemblyView } from "./AssemblyView";
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
  const [assemblySettled, setAssemblySettled] = useState(false);
  const [pinnedCompletedIds, setPinnedCompletedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
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

  const filteredOrders = useMemo(
    () => orders.filter((order) => getOrderStoreBrand(order) === selectedBrand),
    [orders, selectedBrand],
  );

  const filteredAssemblyItems = useMemo(
    () => assemblyItems.filter((item) => (item.brand?.trim() || "CASHER") === selectedBrand),
    [assemblyItems, selectedBrand],
  );

  const filteredShippedArchive = useMemo(
    () => shippedArchive.filter((order) => getOrderStoreBrand(order) === selectedBrand),
    [selectedBrand, shippedArchive],
  );

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
      typeof nextOrders === "function" ? nextOrders(filteredOrders) : nextOrders;
    const nextById = new Map(resolved.map((order) => [order.id, order]));
    updateOrders(
      orders.map((order) =>
        getOrderStoreBrand(order) === selectedBrand ? (nextById.get(order.id) ?? order) : order,
      ),
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

  const offline = !isInternetOnline || !isServerReachable;

  const handleBrandChange = (brand: string) => {
    setSelectedBrand(brand);
    void refreshFromApi(brand);
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
    <div className="relative mx-auto w-full max-w-3xl space-y-4 sm:space-y-6">
      {offline && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            {!isInternetOnline ? "Нет интернета" : "Сервер недоступен"}
          </p>
          <p className="mt-1 text-amber-800">
            {!isInternetOnline
              ? "Нужен доступ к api.amarix.ru. Работа продолжается локально."
              : "Синхронизация с сервером временно недоступна. Изменения сохранятся при восстановлении связи."}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Отправки</h1>
          <p className="text-xs text-gray-500 sm:text-sm">Сборка и отправка заказов</p>
        </div>
        {brandOptions.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Бренд</span>
            <select
              value={selectedBrand}
              onChange={(e) => handleBrandChange(e.target.value)}
              disabled={isSyncing}
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
        <TabSwitcher active={tab} onChange={handleTabChange} />
      </div>

      {tab === "assembly" ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-6">
          <AssemblyView
            sections={assemblySections}
            allItems={filteredAssemblyItems}
            orders={filteredOrders}
            onItemsChange={handleFilteredAssemblyChange}
            warehouseMap={warehouseMap}
          />
        </div>
      ) : tab === "shipping" ? (
        <ShippingView
          orders={filteredOrders}
          assemblyItems={filteredAssemblyItems}
          selectedBrand={selectedBrand}
          brandOptions={brandOptions}
          onBrandChange={handleBrandChange}
          onOrdersChange={handleFilteredOrdersChange}
        />
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-6">
          <ArchiveView
            orders={filteredOrders}
            shippedArchive={filteredShippedArchive}
            apiOrderIds={apiOrderIds}
            onUnship={unshipFromArchive}
          />
        </div>
      )}
    </div>
  );
}
