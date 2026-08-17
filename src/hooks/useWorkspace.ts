"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { canUnshipFromArchive } from "@/lib/archive-status";
import { reconcileAssemblyChanges } from "@/lib/assembly-demand";
import { collectShippedArchive, normalizeWorkspaceState, preserveLocalShippedState } from "@/lib/shipped-archive";
import {
  ORDERS_API_POLL_MS,
  ORDERS_API_REFRESH_AFTER_SHIP_MS,
} from "@/lib/orders-sync";
import { checkServerReachable, subscribeServerReachability } from "@/lib/server-reachability";
import { persistSessionProgress, persistShippedOrders } from "@/lib/archive-api";
import {
  createWorkspace,
  logClientSync,
  pushWorkspace,
  refreshWorkspaceFromApi,
  subscribeWorkspaceStream,
} from "@/lib/workspace";

function stripAssemblyCollected(items: AssemblyItem[]): AssemblyItem[] {
  return items.map((item) => ({
    ...item,
    collectedCount: 0,
    collectedAt: undefined,
  }));
}
interface UseWorkspaceOptions {
  initialAssembly: AssemblyItem[];
  initialOrders: ShippingOrder[];
  initialApiOrderIds?: string[];
  initialShippedArchive?: ShippingOrder[];
  initialRevision?: number;
  /** Фоновый poll unshipped API для выбранного бренда */
  pollBrand?: string;
}

export function useWorkspace({
  initialAssembly,
  initialOrders,
  initialApiOrderIds = [],
  initialShippedArchive = [],
  initialRevision = 0,
  pollBrand,
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
  // Always start online so SSR HTML matches the first client render (avoids hydration mismatch).
  const [isInternetOnline, setIsInternetOnline] = useState(true);
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const refreshRequestIdRef = useRef(0);

  assemblyRef.current = assemblyItems;
  ordersRef.current = orders;

  const applyWorkspaceState = useCallback((workspace: SharedWorkspaceState) => {
    const next = normalizeWorkspaceState(
      preserveLocalShippedState(workspace, ordersRef.current, shippedArchiveRef.current),
    );
    // Сборка локальная и не синкается — сохраняем collected при апдейтах с сервера.
    const localById = new Map(assemblyRef.current.map((item) => [item.id, item]));
    const assemblyItems = next.assemblyItems.map((item) => {
      const local = localById.get(item.id);
      if (!local || local.collectedCount <= 0) {
        return { ...item, collectedCount: 0, collectedAt: undefined };
      }
      return {
        ...item,
        collectedCount: Math.min(local.collectedCount, item.quantity),
        collectedAt: local.collectedAt,
      };
    });

    shippedArchiveRef.current = next.shippedArchive ?? [];
    setAssemblyItems(assemblyItems);
    assemblyRef.current = assemblyItems;
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
          if (
            result.workspace &&
            result.workspace.revision >= revisionRef.current
          ) {
            applyWorkspaceState(result.workspace);
          } else if (!result.workspace) {
            setIsServerReachable(false);
          }
        })
        .finally(() => {
          setIsSyncing(false);
        });
    },
    [applyWorkspaceState],
  );

  const refreshFromApi = useCallback(
    async (brand?: string, options?: { silent?: boolean }) => {
      const requestId = ++refreshRequestIdRef.current;
      if (!options?.silent) setIsSyncing(true);
      try {
        const result = await refreshWorkspaceFromApi(brand);
        if (requestId !== refreshRequestIdRef.current) {
          return { ok: false as const };
        }
        if (result.ok && result.workspace) {
          applyWorkspaceState(result.workspace);
          setIsServerReachable(true);
          return { ok: true as const };
        }
        setIsServerReachable(false);
        return { ok: false as const, error: result.error };
      } finally {
        if (requestId === refreshRequestIdRef.current && !options?.silent) {
          setIsSyncing(false);
        }
      }
    },
    [applyWorkspaceState],
  );

  const scheduleRefreshAfterShip = useCallback(
    (brand?: string) => {
      window.setTimeout(() => {
        void refreshFromApi(brand, { silent: true });
      }, ORDERS_API_REFRESH_AFTER_SHIP_MS);
    },
    [refreshFromApi],
  );

  const persist = useCallback(
    (assembly: AssemblyItem[], ords: ShippingOrder[]) => {
      const prevArchiveIds = new Set(shippedArchiveRef.current.map((order) => order.id));
      // collected не пишем на сервер — только список позиций и заказы/сканы.
      const workspace = normalizeWorkspaceState(
        createWorkspace(stripAssemblyCollected(assembly), ords, shippedArchiveRef.current),
      );
      const archive = workspace.shippedArchive ?? [];
      const newlyShipped = archive.filter((order) => !prevArchiveIds.has(order.id));

      // Отправленные сразу уходят в архив и пропадают из активного списка
      ordersRef.current = workspace.orders;
      setOrders(workspace.orders);
      shippedArchiveRef.current = archive;
      setShippedArchive(archive);

      if (newlyShipped.length > 0) {
        void persistShippedOrders(newlyShipped).then((ok) => {
          if (!ok) setIsServerReachable(false);
        });
      }

      void persistSessionProgress(workspace).then((saved) => {
        if (!saved) {
          setIsServerReachable(false);
          return;
        }
        pushToServer(workspace);
      });
    },
    [pushToServer],
  );

  useEffect(() => {
    void checkServerReachable().then(setIsServerReachable);
    return subscribeServerReachability(setIsServerReachable);
  }, []);

  useEffect(() => {
    return subscribeWorkspaceStream({
      onSync: applyFromServer,
      onWorkspace: applyFromServer,
      onConnectionChange: setIsStreamConnected,
    });
  }, [applyFromServer, applyWorkspaceState]);

  useEffect(() => {
    setIsInternetOnline(navigator.onLine);
    const onOnline = () => setIsInternetOnline(true);
    const onOffline = () => setIsInternetOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!pollBrand) return;

    let cancelled = false;

    const runSilentRefresh = () => {
      if (cancelled || document.visibilityState !== "visible" || !navigator.onLine) return;
      void refreshFromApi(pollBrand, { silent: true });
    };

    const timer = window.setInterval(runSilentRefresh, ORDERS_API_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") runSilentRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollBrand, refreshFromApi]);

  const updateAssembly = useCallback((items: AssemblyItem[]) => {
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
    // Сборка не персистится — сбросится при обновлении страницы.
  }, []);

  const updateOrders = useCallback(
    (next: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[])) => {
      const prev = ordersRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      const assembly = reconcileAssemblyChanges(prev, resolved, assemblyRef.current);

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

      const prevOrders = ordersRef.current;
      const assembly = reconcileAssemblyChanges(prevOrders, nextOrders, assemblyRef.current);
      ordersRef.current = nextOrders;
      assemblyRef.current = assembly;
      setOrders(nextOrders);
      setAssemblyItems(assembly);
      persist(assembly, nextOrders);

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
    refreshFromApi,
    scheduleRefreshAfterShip,
  };
}
