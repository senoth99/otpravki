"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { reconcileAssemblyOnShip } from "@/lib/assembly-demand";
import {
  collectShippedArchive,
  mergeWorkspaceWithLocalArchive,
  normalizeWorkspaceState,
} from "@/lib/shipped-archive";
import { checkServerReachable, subscribeServerReachability } from "@/lib/server-reachability";
import {
  applySharedWorkspace,
  clearSyncQueue,
  createWorkspace,
  fetchSharedWorkspace,
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

const POLL_MS = 300;

export function useWorkspace({
  initialAssembly,
  initialOrders,
  initialApiOrderIds = [],
  initialShippedArchive = [],
}: UseWorkspaceOptions) {
  const revisionRef = useRef(0);
  const applyingRemote = useRef(false);
  const assemblyRef = useRef(initialAssembly);
  const ordersRef = useRef(initialOrders);
  const shippedArchiveRef = useRef(collectShippedArchive(initialOrders, initialShippedArchive));
  const serverReachableRef = useRef(true);
  const pushChainRef = useRef(Promise.resolve());
  const pendingPersistRef = useRef<{
    assembly: AssemblyItem[];
    orders: ShippingOrder[];
  } | null>(null);

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncReady, setSyncReady] = useState(false);

  assemblyRef.current = assemblyItems;
  ordersRef.current = orders;
  serverReachableRef.current = isServerReachable;

  const flushPendingPersist = useCallback(() => {
    const pending = pendingPersistRef.current;
    if (!pending) return;
    pendingPersistRef.current = null;
    const workspace = normalizeWorkspaceState(
      createWorkspace(pending.assembly, pending.orders, shippedArchiveRef.current),
    );
    shippedArchiveRef.current = workspace.shippedArchive ?? [];
    setShippedArchive(workspace.shippedArchive ?? []);
    saveWorkspace(workspace);
    void pushToServerRef.current(workspace);
  }, []);

  const applyWorkspaceState = useCallback((workspace: SharedWorkspaceState) => {
    shippedArchiveRef.current = workspace.shippedArchive ?? [];
    setAssemblyItems(workspace.assemblyItems);
    setOrders(workspace.orders);
    setShippedArchive(workspace.shippedArchive ?? []);
    setApiOrderIds(workspace.apiOrderIds ?? []);
    saveWorkspace(workspace);
    setLastSyncAt(Date.now());
    setPendingSync(getPendingSyncCount());
  }, []);

  const applyRemote = useCallback(
    (remote: SharedWorkspaceState) => {
      if (remote.revision <= revisionRef.current) return;

      applyingRemote.current = true;

      const local = createWorkspace(
        assemblyRef.current,
        ordersRef.current,
        shippedArchiveRef.current,
      );
      const next = normalizeWorkspaceState(applySharedWorkspace(local, remote));

      applyWorkspaceState(next);
      revisionRef.current = remote.revision;

      queueMicrotask(() => {
        applyingRemote.current = false;
        flushPendingPersist();
      });
    },
    [applyWorkspaceState, flushPendingPersist],
  );

  const applyOwnPush = useCallback(
    (remote: SharedWorkspaceState) => {
      if (remote.revision <= revisionRef.current) return;

      applyingRemote.current = true;
      applyWorkspaceState(normalizeWorkspaceState(remote));
      revisionRef.current = remote.revision;

      queueMicrotask(() => {
        applyingRemote.current = false;
        flushPendingPersist();
      });
    },
    [applyWorkspaceState, flushPendingPersist],
  );

  const pushToServerRef = useRef(
    (_workspace: ReturnType<typeof createWorkspace>) => Promise.resolve(),
  );

  const pushToServer = useCallback(
    (workspace: ReturnType<typeof createWorkspace>) => {
      pushChainRef.current = pushChainRef.current
        .then(async () => {
          setIsSyncing(true);
          try {
            const result = await pushWorkspace(workspace);
            if (result.workspace) {
              applyOwnPush(result.workspace);
            }
            setPendingSync(getPendingSyncCount());
            if (!result.ok) {
              serverReachableRef.current = await checkServerReachable();
              setIsServerReachable(serverReachableRef.current);
            }
          } finally {
            setIsSyncing(false);
          }
        })
        .catch(() => {
          setIsSyncing(false);
        });

      return pushChainRef.current;
    },
    [applyOwnPush],
  );

  pushToServerRef.current = pushToServer;

  const replaceWorkspace = useCallback(
    (remote: SharedWorkspaceState, options?: { push?: boolean }) => {
      applyingRemote.current = true;
      const normalized = normalizeWorkspaceState(remote);
      applyWorkspaceState(normalized);
      revisionRef.current = normalized.revision;

      queueMicrotask(() => {
        applyingRemote.current = false;
        if (options?.push) {
          void pushToServer(normalized);
        } else {
          flushPendingPersist();
        }
      });
    },
    [applyWorkspaceState, flushPendingPersist, pushToServer],
  );

  const persist = useCallback(
    (assembly: AssemblyItem[], ords: ShippingOrder[]) => {
      if (applyingRemote.current) {
        pendingPersistRef.current = { assembly, orders: ords };
        return;
      }

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
        applyOwnPush(result.workspace);
      } else if (result.synced > 0) {
        setLastSyncAt(Date.now());
      }
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [applyOwnPush]);

  useEffect(() => {
    const bootstrap = async () => {
      const reachable = await checkServerReachable();
      setIsServerReachable(reachable);
      serverReachableRef.current = reachable;

      let remote: SharedWorkspaceState | null = null;
      let fetchFailed = false;

      try {
        remote = await fetchSharedWorkspace();
      } catch {
        fetchFailed = true;
      }

      if (remote?.resetToken) {
        syncResetToken(remote.resetToken);
      }

      if (remote && remote.revision < revisionRef.current) {
        clearSyncQueue();
        setSyncReady(true);
        setPendingSync(getPendingSyncCount());
        return;
      }

      const local = loadWorkspace();

      if (remote) {
        const base =
          local ?? createWorkspace(initialAssembly, initialOrders, initialShippedArchive);
        const merged = normalizeWorkspaceState(applySharedWorkspace(base, remote));
        if (merged.revision >= revisionRef.current) {
          revisionRef.current = merged.revision;
          applyWorkspaceState(merged);
        }
        clearSyncQueue();
        if (local && merged.updatedAt > remote.updatedAt) {
          void pushToServer(merged);
        }
      } else if (!fetchFailed && local) {
        const archive = collectShippedArchive(local.orders, local.shippedArchive);
        shippedArchiveRef.current = archive;
        setAssemblyItems(local.assemblyItems);
        setOrders(local.orders);
        setShippedArchive(archive);
        setApiOrderIds(local.apiOrderIds ?? []);
        void pushToServer({ ...local, shippedArchive: archive });
      }

      setSyncReady(true);
      setPendingSync(getPendingSyncCount());

      if (!fetchFailed) {
        await runSync();
      }
    };

    void bootstrap();
  }, [initialAssembly, initialOrders, applyOwnPush, applyWorkspaceState, pushToServer, runSync]);

  useEffect(() => {
    return subscribeWorkspaceStream({
      onWorkspace: applyRemote,
      onConnectionChange: setIsStreamConnected,
    });
  }, [applyRemote]);

  useEffect(() => {
    const poll = () => {
      if (applyingRemote.current) return;
      void fetchSharedWorkspace()
        .then((workspace) => {
          if (workspace) applyRemote(workspace);
        })
        .catch(() => {
          // network blip — next poll retries
        });
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [applyRemote]);

  useEffect(() => {
    return subscribeServerReachability((reachable) => {
      setIsServerReachable(reachable);
      serverReachableRef.current = reachable;
      if (reachable) void runSync();
    });
  }, [runSync]);

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
      assemblyRef.current = items;
      setAssemblyItems(items);
      if (syncReady) persist(items, ordersRef.current);
    },
    [persist, syncReady],
  );

  const refreshFromApi = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!navigator.onLine) {
      return { ok: false, error: "Нет подключения к интернету" };
    }

    setIsRefreshing(true);
    try {
      const result = await refreshWorkspaceFromApi();
      if (result.workspace) {
        const { orders: mergedOrders, shippedArchive: mergedArchive } =
          mergeWorkspaceWithLocalArchive(
            result.workspace,
            ordersRef.current,
            shippedArchiveRef.current,
          );
        replaceWorkspace(
          {
            ...result.workspace,
            orders: mergedOrders,
            shippedArchive: mergedArchive,
          },
          { push: true },
        );
      }
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error ?? "Не удалось обновить" };
    } finally {
      setIsRefreshing(false);
    }
  }, [replaceWorkspace]);

  const updateOrders = useCallback(
    (next: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[])) => {
      const prev = ordersRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      const assembly = reconcileAssemblyOnShip(prev, resolved, assemblyRef.current);

      ordersRef.current = resolved;
      assemblyRef.current = assembly;
      setOrders(resolved);
      setAssemblyItems(assembly);
      if (syncReady) persist(assembly, resolved);
    },
    [persist, syncReady],
  );

  return {
    assemblyItems,
    orders,
    shippedArchive,
    apiOrderIds,
    updateAssembly,
    updateOrders,
    isServerReachable,
    isInternetOnline,
    isStreamConnected,
    isSyncing,
    isRefreshing,
    pendingSync,
    lastSyncAt,
    syncReady,
    syncNow: runSync,
    refreshFromApi,
  };
}
