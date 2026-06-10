"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { canUnshipFromArchive } from "@/lib/archive-status";
import { reconcileAssemblyOnShip } from "@/lib/assembly-demand";
import {
  collectShippedArchive,
  mergeWorkspaceWithLocalArchive,
  normalizeWorkspaceState,
} from "@/lib/shipped-archive";
import { checkServerReachable, subscribeServerReachability } from "@/lib/server-reachability";
import {
  createWorkspace,
  logClientSync,
  fetchSharedWorkspace,
  fetchWorkspaceRevision,
  flushSyncQueue,
  getPendingSyncCount,
  loadWorkspace,
  pushWorkspace,
  refreshWorkspaceFromApi,
  saveWorkspace,
  subscribeWorkspaceStream,
  syncResetToken,
} from "@/lib/workspace";

interface UseWorkspaceOptions {
  initialAssembly: AssemblyItem[];
  initialOrders: ShippingOrder[];
  initialApiOrderIds?: string[];
  initialShippedArchive?: ShippingOrder[];
}

const REVISION_POLL_MS = 500;

export function useWorkspace({
  initialAssembly,
  initialOrders,
  initialApiOrderIds = [],
  initialShippedArchive = [],
}: UseWorkspaceOptions) {
  const revisionRef = useRef(0);
  const bootstrappedRef = useRef(false);
  const userEditedRef = useRef(false);
  const assemblyRef = useRef(initialAssembly);
  const ordersRef = useRef(initialOrders);
  const shippedArchiveRef = useRef(collectShippedArchive(initialOrders, initialShippedArchive));
  const pushChainRef = useRef(Promise.resolve());

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
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncReady, setSyncReady] = useState(false);
  const [serverRevision, setServerRevision] = useState(0);
  const [clientRevision, setClientRevision] = useState(0);

  assemblyRef.current = assemblyItems;
  ordersRef.current = orders;

  const applyWorkspaceState = useCallback((workspace: SharedWorkspaceState) => {
    const next = normalizeWorkspaceState(workspace);
    shippedArchiveRef.current = next.shippedArchive ?? [];
    setAssemblyItems([...next.assemblyItems]);
    setOrders([...next.orders]);
    setShippedArchive(next.shippedArchive ?? []);
    setApiOrderIds(next.apiOrderIds ?? []);
    setServerRevision(next.revision);
    setClientRevision(next.revision);
    revisionRef.current = next.revision;
    saveWorkspace(next);
    setLastSyncAt(Date.now());
    setPendingSync(getPendingSyncCount());
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
      pushChainRef.current = pushChainRef.current
        .then(async () => {
          setIsSyncing(true);
          try {
            const result = await pushWorkspace(workspace);
            if (result.workspace) {
              applyWorkspaceState(result.workspace);
            } else {
              setIsServerReachable(await checkServerReachable());
            }
            setPendingSync(getPendingSyncCount());
          } finally {
            setIsSyncing(false);
          }
        })
        .catch(() => {
          setIsSyncing(false);
          setPendingSync(getPendingSyncCount());
        });

      return pushChainRef.current;
    },
    [applyWorkspaceState],
  );

  const pullRemote = useCallback(async () => {
    setIsPulling(true);
    try {
      const workspace = await fetchSharedWorkspace();
      if (workspace) applyFromServer(workspace);
    } catch {
      // retry on next poll
    } finally {
      setIsPulling(false);
    }
  }, [applyFromServer]);

  const persist = useCallback(
    (assembly: AssemblyItem[], ords: ShippingOrder[]) => {
      userEditedRef.current = true;

      const workspace = normalizeWorkspaceState(
        createWorkspace(assembly, ords, shippedArchiveRef.current),
      );
      shippedArchiveRef.current = workspace.shippedArchive ?? [];
      setShippedArchive(workspace.shippedArchive ?? []);
      saveWorkspace(workspace);
      void pushToServer(workspace);
    },
    [pushToServer],
  );

  const runSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await flushSyncQueue();
      setPendingSync(getPendingSyncCount());
      if (result.workspace) {
        applyWorkspaceState(result.workspace);
      } else if (result.synced > 0) {
        setLastSyncAt(Date.now());
      }
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [applyWorkspaceState]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const bootstrap = async () => {
      setIsServerReachable(await checkServerReachable());
      await runSync();

      let remote: SharedWorkspaceState | null = null;
      try {
        remote = await fetchSharedWorkspace();
      } catch {
        // offline — use local cache
      }

      if (remote?.resetToken) {
        syncResetToken(remote.resetToken);
      }

      const local = loadWorkspace();

      if (userEditedRef.current && local) {
        const pushed = await pushWorkspace(local);
        if (pushed.workspace) {
          applyWorkspaceState(pushed.workspace);
        } else {
          applyWorkspaceState({ ...local, revision: remote?.revision ?? 0 } as SharedWorkspaceState);
        }
        setSyncReady(true);
        return;
      }

      if (local && remote && local.updatedAt > remote.updatedAt) {
        const pushed = await pushWorkspace(local);
        if (pushed.workspace) {
          applyWorkspaceState(pushed.workspace);
        } else {
          applyWorkspaceState({ ...local, revision: remote.revision } as SharedWorkspaceState);
        }
      } else if (remote) {
        applyWorkspaceState(remote);
      } else if (local) {
        applyWorkspaceState({ ...local, revision: 0 } as SharedWorkspaceState);
        await pushToServer(local);
      }

      setSyncReady(true);
      setPendingSync(getPendingSyncCount());
    };

    void bootstrap();
  }, [applyWorkspaceState, pushToServer, runSync]);

  useEffect(() => {
    return subscribeWorkspaceStream({
      onWorkspace: applyFromServer,
      onConnectionChange: setIsStreamConnected,
      onRevisionPing: (revision) => {
        setServerRevision(revision);
        if (revision > revisionRef.current) {
          void pullRemote();
        }
      },
    });
  }, [applyFromServer, pullRemote]);

  useEffect(() => {
    const pollRevision = () => {
      void fetchWorkspaceRevision()
        .then((revision) => {
          setServerRevision(revision);
          if (revision > revisionRef.current) {
            void pullRemote();
          }
        })
        .catch(() => {
          // retry
        });
    };

    pollRevision();
    const interval = setInterval(pollRevision, REVISION_POLL_MS);
    return () => clearInterval(interval);
  }, [pullRemote]);

  useEffect(() => {
    return subscribeServerReachability((reachable) => {
      setIsServerReachable(reachable);
      if (reachable) {
        void pullRemote();
        void runSync();
      }
    });
  }, [pullRemote, runSync]);

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

  const refreshFromApi = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
    ordersCount?: number;
    assemblyCount?: number;
  }> => {
    setIsRefreshing(true);
    try {
      const result = await refreshWorkspaceFromApi();
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Не удалось обновить" };
      }
      if (!result.workspace) {
        return { ok: false, error: "Пустой ответ сервера" };
      }

      const { orders: mergedOrders, shippedArchive: mergedArchive } =
        mergeWorkspaceWithLocalArchive(
          result.workspace,
          ordersRef.current,
          shippedArchiveRef.current,
        );
      const merged = normalizeWorkspaceState({
        ...result.workspace,
        orders: mergedOrders,
        shippedArchive: mergedArchive,
      });
      applyWorkspaceState(merged);
      userEditedRef.current = true;
      await pushToServer(merged);

      return {
        ok: true,
        ordersCount: result.ordersCount,
        assemblyCount: result.assemblyCount,
      };
    } finally {
      setIsRefreshing(false);
    }
  }, [applyWorkspaceState, pushToServer]);

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

  const unshipFromArchive = useCallback(
    (orderId: string): { ok: true } | { ok: false; error: string } => {
      const apiSet = new Set(apiOrderIds);
      if (!canUnshipFromArchive(orderId, apiSet)) {
        return { ok: false, error: "Заказ уже уехал в СДЭК — отменить нельзя" };
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
        barcodePrintedAt: Date.now(),
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
    [apiOrderIds, persist],
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
    isPulling,
    isRefreshing,
    pendingSync,
    lastSyncAt,
    serverRevision,
    clientRevision,
    syncReady,
    syncNow: runSync,
    refreshFromApi,
  };
}
