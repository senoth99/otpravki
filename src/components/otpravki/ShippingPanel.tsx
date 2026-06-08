"use client";

import { useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { AssemblyItem, ShippingOrder, ShippingTab } from "@/types/shipping";
import { AssemblyView } from "./AssemblyView";
import { ShippingView } from "./ShippingView";
import { SyncIndicator } from "./SyncIndicator";
import { TabSwitcher } from "./TabSwitcher";

interface ShippingPanelProps {
  assemblyItems: AssemblyItem[];
  orders: ShippingOrder[];
}

export function ShippingPanel({ assemblyItems: initialAssembly, orders: initialOrders }: ShippingPanelProps) {
  const [tab, setTab] = useState<ShippingTab>("assembly");
  const {
    assemblyItems,
    orders,
    updateAssembly,
    updateOrders,
    isOnline,
    isSyncing,
    pendingSync,
  } = useWorkspace({ initialAssembly, initialOrders });

  return (
    <>
      <SyncIndicator isOnline={isOnline} isSyncing={isSyncing} pendingSync={pendingSync} />
      <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Отправки</h1>
          <p className="text-xs text-gray-500 sm:text-sm">Сборка и отправка заказов</p>
        </div>
        <TabSwitcher active={tab} onChange={setTab} />
      </div>

      {tab === "assembly" ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-6">
          <AssemblyView items={assemblyItems} onItemsChange={updateAssembly} />
        </div>
      ) : (
        <ShippingView
          orders={orders}
          assemblyItems={assemblyItems}
          onOrdersChange={updateOrders}
        />
      )}
    </div>
    </>
  );
}
