"use client";

import { useEffect, useState } from "react";
import { StageLoadingScreen } from "@/components/ui/StageLoadingScreen";
import { fetchSharedWorkspace } from "@/lib/workspace";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";
import { AssemblyPanel } from "./AssemblyPanel";

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-dvh max-h-dvh w-full items-center justify-center overflow-hidden bg-gray-50 p-4 overscroll-none">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="mt-2 text-sm text-gray-500">{hint}</p>
      </div>
    </div>
  );
}

async function fetchWarehouseMap(): Promise<WarehouseMapConfig> {
  try {
    const res = await fetch("/api/warehouse-map", { cache: "no-store" });
    if (!res.ok) return { furniture: [], updatedAt: 0 };
    const data = (await res.json()) as { data?: WarehouseMapConfig };
    return data.data ?? { furniture: [], updatedAt: 0 };
  } catch {
    return { furniture: [], updatedAt: 0 };
  }
}

export function SborkaBootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<{ title: string; hint: string } | null>(null);
  const [assemblyItems, setAssemblyItems] = useState<AssemblyItem[]>([]);
  const [orders, setOrders] = useState<ShippingOrder[]>([]);
  const [apiOrderIds, setApiOrderIds] = useState<string[]>([]);
  const [shippedArchive, setShippedArchive] = useState<ShippingOrder[]>([]);
  const [initialRevision, setInitialRevision] = useState(0);
  const [warehouseMap, setWarehouseMap] = useState<WarehouseMapConfig | undefined>();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [workspace, map] = await Promise.all([fetchSharedWorkspace(), fetchWarehouseMap()]);
        if (cancelled) return;

        if (!workspace) {
          setError({
            title: "Заказы ещё не загружены",
            hint: "Откройте отправки или нажмите «Обновить» — затем вернитесь в сборку",
          });
          return;
        }

        setAssemblyItems(workspace.assemblyItems);
        setOrders(workspace.orders);
        setApiOrderIds(workspace.apiOrderIds ?? []);
        setShippedArchive(workspace.shippedArchive ?? []);
        setInitialRevision(workspace.revision);
        setWarehouseMap(map);
        setReady(true);
      } catch (loadError) {
        if (cancelled) return;
        setError({
          title: "Не удалось загрузить сборку",
          hint: loadError instanceof Error ? loadError.message : "Проверьте сеть и обновите страницу",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <EmptyState title={error.title} hint={error.hint} />;
  }

  if (!ready) {
    return <StageLoadingScreen variant="fullscreen" />;
  }

  return (
    <AssemblyPanel
      assemblyItems={assemblyItems}
      orders={orders}
      apiOrderIds={apiOrderIds}
      shippedArchive={shippedArchive}
      initialRevision={initialRevision}
      warehouseMap={warehouseMap}
    />
  );
}
