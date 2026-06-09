"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { computeCompletedAssemblyIds, getAssemblyViewSections } from "@/lib/assembly-demand";
import type { AssemblyItem, ShippingOrder, ShippingTab } from "@/types/shipping";
import { ArchiveView } from "./ArchiveView";
import { AssemblyView } from "./AssemblyView";
import { RefreshButton } from "./RefreshButton";
import { ShippingView } from "./ShippingView";
import { SyncIndicator } from "./SyncIndicator";
import { TabSwitcher } from "./TabSwitcher";

interface ShippingPanelProps {
  assemblyItems: AssemblyItem[];
  orders: ShippingOrder[];
  apiOrderIds?: string[];
  shippedArchive?: ShippingOrder[];
  enableApiRefresh?: boolean;
}

export function ShippingPanel({
  assemblyItems: initialAssembly,
  orders: initialOrders,
  apiOrderIds: initialApiOrderIds = [],
  shippedArchive: initialShippedArchive = [],
  enableApiRefresh = true,
}: ShippingPanelProps) {
  const [tab, setTab] = useState<ShippingTab>("assembly");
  const [assemblySettled, setAssemblySettled] = useState(false);
  const [pinnedCompletedIds, setPinnedCompletedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const {
    assemblyItems,
    orders,
    apiOrderIds,
    shippedArchive,
    updateAssembly,
    updateOrders,
    isOnline,
    isSyncing,
    isRefreshing,
    pendingSync,
    refreshFromApi,
  } = useWorkspace({
    initialAssembly,
    initialOrders,
    initialApiOrderIds,
    initialShippedArchive,
  });

  const assemblySections = useMemo(
    () =>
      getAssemblyViewSections(
        assemblyItems,
        orders,
        assemblySettled,
        assemblySettled ? pinnedCompletedIds : undefined,
      ),
    [assemblyItems, orders, assemblySettled, pinnedCompletedIds],
  );

  const handleTabChange = (next: ShippingTab) => {
    if (tab === "assembly" && next !== "assembly") {
      setAssemblySettled(true);
    }
    if (next === "assembly" && assemblySettled) {
      setPinnedCompletedIds(new Set(computeCompletedAssemblyIds(assemblyItems, orders)));
    }
    setTab(next);
  };

  const handleRefresh = async () => {
    setRefreshError(null);
    const result = await refreshFromApi();
    if (!result.ok) {
      setRefreshError(result.error ?? "Ошибка обновления");
    } else if (assemblySettled) {
      setPinnedCompletedIds(new Set());
    }
  };

  return (
    <>
      <SyncIndicator isOnline={isOnline} isSyncing={isSyncing} pendingSync={pendingSync} />
      <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Отправки</h1>
            <p className="text-xs text-gray-500 sm:text-sm">Сборка и отправка заказов</p>
          </div>
          {enableApiRefresh && (
            <RefreshButton
              onClick={() => void handleRefresh()}
              loading={isRefreshing}
              disabled={!isOnline || isSyncing}
            />
          )}
        </div>
        {refreshError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
            {refreshError}
          </p>
        )}
        <TabSwitcher active={tab} onChange={handleTabChange} />
      </div>

      {tab === "assembly" ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-6">
          <AssemblyView
            sections={assemblySections}
            allItems={assemblyItems}
            onItemsChange={updateAssembly}
          />
        </div>
      ) : tab === "shipping" ? (
        <ShippingView
          orders={orders}
          assemblyItems={assemblyItems}
          onOrdersChange={updateOrders}
        />
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-6">
          <ArchiveView
            orders={orders}
            shippedArchive={shippedArchive}
            apiOrderIds={apiOrderIds}
          />
        </div>
      )}
    </div>
    </>
  );
}
