"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { canUnshipFromArchive } from "@/lib/archive-status";
import { reconcileAssemblyOnShip } from "@/lib/assembly-demand";
import { collectShippedArchive, normalizeWorkspaceState } from "@/lib/shipped-archive";
import { checkServerReachable, subscribeServerReachability } from "@/lib/server-reachability";
import { persistSessionProgress, persistShippedOrders } from "@/lib/archive-api";
import {
  createWorkspace,
  logClientSync,
  pushWorkspace,
  subscribeWorkspaceStream,
} from "@/lib/workspace";

interface UseWorkspaceOptions {
  initialAssembly: AssemblyItem[];
  initialOrders: ShippingOrder[];
  initialApiOrderIds?: string[];
  initialShippedArchive?: ShippingOrder[];
  initialRevision?: number;
}

export function useWorkspace({
  initialAssembly,
  initialOrders,
  initialApiOrderIds = [],
  initialShippedArchive = [],
  initialRevision = 0,
}: UseWorkspaceOptions) {
  const revisionRef = useRef(initialRevision);
  const assemblyRef = useRef(initialAssembly);
  const ordersRef = useRef(initialOrders);
  const shippedArchiveRef = useRef(collectShippedArchive(initialOrders, initialShippedArchive));

  const [assemblyItems, setAssemblyItems] = useState(initialAssembly);
  const [orders, setOrders] = useState(initialOrders);
  const [shippedArchive, setShippedArchive] = useState(shippedArchiveRef.current);
  const [apiOrderIds, setApiOrderIds] = useState(initialApiOrderIds);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [isInternetOnline, setIsInternetOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine,
  );
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  assemblyRef.current = assemblyItems;
  ordersRef.current = orders;

  const applyWorkspaceState = useCallback((workspace: SharedWorkspaceState) => {
    const next = normalizeWorkspaceState(workspace);
    shippedArchiveRef.current = next.shippedArchive ?? [];
    setAssemblyItems([...next.assemblyItems]);
    setOrders([...next.orders]);
    setShippedArchive(next.shippedArchive ?? []);
    setApiOrderIds(next.apiOrderIds ?? []);
    revisionRef.current = next.revision;
  }, []);

  const applyFromServer = useCallback(
    (remote: SharedWorkspaceState) => {
      if (remote.revision <= revisionRef.current) return;
      applyWorkspaceState(remote);
    },
    [applyWorkspaceState],
  );

  const pushToServer = useCallback(
    (workspace: ReturnType<typeof createWorkspace>) => {
      setIsSyncing(true);
      void pushWorkspace(workspace)
        .then((result) => {
          if (result.workspace) {
            applyWorkspaceState(result.workspace);
          } else {
            setIsServerReachable(false);
          }
        })
        .finally(() => {
          setIsSyncing(false);
        });
    },
    [applyWorkspaceState],
  );

  const persist = useCallback(
    (assembly: AssemblyItem[], ords: ShippingOrder[]) => {
      const prevArchiveIds = new Set(shippedArchiveRef.current.map((order) => order.id));
      const workspace = normalizeWorkspaceState(
        createWorkspace(assembly, ords, shippedArchiveRef.current),
      );
      const archive = workspace.shippedArchive ?? [];
      const newlyShipped = archive.filter((order) => !prevArchiveIds.has(order.id));

      shippedArchiveRef.current = archive;
      setShippedArchive(archive);

      if (newlyShipped.length > 0) {
        void persistShippedOrders(newlyShipped).then((ok) => {
          if (!ok) setIsServerReachable(false);
        });
      }

      void persistSessionProgress(workspace);
      pushToServer(workspace);
    },
    [pushToServer],
  );

  useEffect(() => {
    void checkServerReachable().then(setIsServerReachable);
    return subscribeServerReachability(setIsServerReachable);
  }, []);

  useEffect(() => {
    return subscribeWorkspaceStream({
      onWorkspace: applyFromServer,
      onConnectionChange: setIsStreamConnected,
    });
  }, [applyFromServer]);

  useEffect(() => {
    const onOnline = () => setIsInternetOnline(true);
    const onOffline = () => setIsInternetOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const updateAssembly = useCallback(
    (items: AssemblyItem[]) => {
      const changed = items.find((item) => {
        const prev = assemblyRef.current.find((p) => p.id === item.id);
        return prev && prev.collectedCount !== item.collectedCount;
      });
      assemblyRef.current = items;
      setAssemblyItems(items);
      logClientSync("assembly.change", {
        meta: {
          itemId: changed?.id,
          collectedCount: changed?.collectedCount,
          total: items.length,
        },
      });
      persist(items, ordersRef.current);
    },
    [persist],
  );

  const updateOrders = useCallback(
    (next: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[])) => {
      const prev = ordersRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      const assembly = reconcileAssemblyOnShip(prev, resolved, assemblyRef.current);

      ordersRef.current = resolved;
      assemblyRef.current = assembly;
      setOrders(resolved);
      setAssemblyItems(assembly);
      persist(assembly, resolved);
    },
    [persist],
  );

  const apiSet = useMemo(() => new Set(apiOrderIds), [apiOrderIds]);

  const unshipFromArchive = useCallback(
    (orderId: string): { ok: true } | { ok: false; error: string } => {
      if (!canUnshipFromArchive(orderId, apiSet)) {
        return { ok: false, error: "Заказ уже отправлен в СДЭК — отменить нельзя" };
      }

      const archived =
        shippedArchiveRef.current.find((order) => order.id === orderId) ??
        ordersRef.current.find((order) => order.id === orderId && order.barcodePrinted);

      if (!archived) {
        return { ok: false, error: "Заказ не найден в архиве" };
      }

      const unshipped: ShippingOrder = {
        ...archived,
        barcodePrinted: false,
        barcodePrintedAt: undefined,
        items: archived.items.map((item) => ({
          ...item,
          scannedCount: 0,
          scannedAt: undefined,
        })),
      };

      shippedArchiveRef.current = shippedArchiveRef.current.filter((order) => order.id !== orderId);
      setShippedArchive([...shippedArchiveRef.current]);

      const nextOrders = [
        ...ordersRef.current.filter((order) => order.id !== orderId),
        unshipped,
      ];

      ordersRef.current = nextOrders;
      setOrders(nextOrders);
      persist(assemblyRef.current, nextOrders);

      return { ok: true };
    },
    [apiSet, persist],
  );

  return {
    assemblyItems,
    orders,
    shippedArchive,
    apiOrderIds,
    updateAssembly,
    updateOrders,
    unshipFromArchive,
    isServerReachable,
    isInternetOnline,
    isStreamConnected,
    isSyncing,
  };
}
