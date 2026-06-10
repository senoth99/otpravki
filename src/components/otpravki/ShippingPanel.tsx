"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { computeCompletedAssemblyIds, getAssemblyViewSections } from "@/lib/assembly-demand";
import type { AssemblyItem, ShippingOrder, ShippingTab } from "@/types/shipping";
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
}

export function ShippingPanel({
  assemblyItems: initialAssembly,
  orders: initialOrders,
  apiOrderIds: initialApiOrderIds = [],
  shippedArchive: initialShippedArchive = [],
  initialRevision = 0,
}: ShippingPanelProps) {
  const [tab, setTab] = useState<ShippingTab>("assembly");
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
  } = useWorkspace({
    initialAssembly,
    initialOrders,
    initialApiOrderIds,
    initialShippedArchive,
    initialRevision,
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

  const offline = !isInternetOnline || !isServerReachable;

  const handleTabChange = (next: ShippingTab) => {
    if (tab === "assembly" && next !== "assembly") {
      setAssemblySettled(true);
    }
    if (next === "assembly" && assemblySettled) {
      setPinnedCompletedIds(new Set(computeCompletedAssemblyIds(assemblyItems, orders)));
    }
    setTab(next);
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl space-y-4 sm:space-y-6">
      {offline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="font-semibold text-gray-900">Нет интернета</p>
            <p className="mt-2 text-sm text-gray-600">
              Нужен доступ к api.cashercollection.com. Перезагрузи страницу, когда сеть появится.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Отправки</h1>
          <p className="text-xs text-gray-500 sm:text-sm">Сборка и отправка заказов</p>
        </div>
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
            onUnship={unshipFromArchive}
          />
        </div>
      )}
    </div>
  );
}
