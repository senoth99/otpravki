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

const REVISION_POLL_MS = 5_000;

export function useWorkspace({
  initialAssembly,
  initialOrders,
  initialApiOrderIds = [],
  initialShippedArchive = [],
}: UseWorkspaceOptions) {
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const pullingRef = useRef(false);
  const assemblyRef = useRef(initialAssembly);
  const ordersRef = useRef(initialOrders);
  const shippedArchiveRef = useRef(collectShippedArchive(initialOrders, initialShippedArchive));
  const serverReachableRef = useRef(true);
  const pushChainRef = useRef(Promise.resolve());
  const pullRemoteRef = useRef<() => void>(() => {});

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
  serverReachableRef.current = isServerReachable;

  const applyWorkspaceState = useCallback((workspace: SharedWorkspaceState) => {
    shippedArchiveRef.current = workspace.shippedArchive ?? [];
    setAssemblyItems([...workspace.assemblyItems]);
    setOrders([...workspace.orders]);
    setShippedArchive(workspace.shippedArchive ?? []);
    setApiOrderIds(workspace.apiOrderIds ?? []);
    setServerRevision(workspace.revision);
    setClientRevision(workspace.revision);
    revisionRef.current = workspace.revision;
    saveWorkspace(workspace);
    setLastSyncAt(Date.now());
    setPendingSync(getPendingSyncCount());
  }, []);

  const applyFromServer = useCallback(
    (remote: SharedWorkspaceState) => {
      if (remote.revision === revisionRef.current) return;

      const next = dirtyRef.current
        ? normalizeWorkspaceState(
            applySharedWorkspace(
              createWorkspace(
                assemblyRef.current,
                ordersRef.current,
                shippedArchiveRef.current,
              ),
              remote,
            ),
          )
        : normalizeWorkspaceState(remote);

      applyWorkspaceState(next);
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
              applyFromServer(result.workspace);
              dirtyRef.current = false;
            } else {
              dirtyRef.current = true;
              serverReachableRef.current = await checkServerReachable();
              setIsServerReachable(serverReachableRef.current);
            }
            setPendingSync(getPendingSyncCount());
          } finally {
            setIsSyncing(false);
          }
        })
        .catch(() => {
          dirtyRef.current = true;
          setIsSyncing(false);
          setPendingSync(getPendingSyncCount());
        });

      return pushChainRef.current;
    },
    [applyFromServer],
  );

  const pullRemote = useCallback(() => {
    if (pullingRef.current) return;
    pullingRef.current = true;
    setIsPulling(true);

    void fetchSharedWorkspace()
      .then((workspace) => {
        if (workspace) applyFromServer(workspace);
      })
      .catch(() => {
        // next poll retries
      })
      .finally(() => {
        pullingRef.current = false;
        setIsPulling(false);
      });
  }, [applyFromServer]);

  pullRemoteRef.current = pullRemote;

  const replaceWorkspace = useCallback(
    (remote: SharedWorkspaceState, options?: { push?: boolean }) => {
      applyWorkspaceState(normalizeWorkspaceState(remote));
      dirtyRef.current = false;

      if (options?.push) {
        dirtyRef.current = true;
        void pushToServer(normalizeWorkspaceState(remote));
      }
    },
    [applyWorkspaceState, pushToServer],
  );

  const persist = useCallback(
    (assembly: AssemblyItem[], ords: ShippingOrder[]) => {
      dirtyRef.current = true;

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
        applyFromServer(result.workspace);
        dirtyRef.current = false;
      } else if (result.synced > 0) {
        setLastSyncAt(Date.now());
      }
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [applyFromServer]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

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

      const local = loadWorkspace();

      if (remote) {
        const base =
          local ?? createWorkspace(initialAssembly, initialOrders, initialShippedArchive);
        const merged = normalizeWorkspaceState(applySharedWorkspace(base, remote));
        applyWorkspaceState(merged);
        clearSyncQueue();
      } else if (!fetchFailed && local) {
        const archive = collectShippedArchive(local.orders, local.shippedArchive);
        shippedArchiveRef.current = archive;
        setAssemblyItems([...local.assemblyItems]);
        setOrders([...local.orders]);
        setShippedArchive(archive);
        setApiOrderIds(local.apiOrderIds ?? []);
        dirtyRef.current = true;
        void pushToServer({ ...local, shippedArchive: archive });
      }

      setSyncReady(true);
      setPendingSync(getPendingSyncCount());

      if (!fetchFailed) {
        await runSync();
      }
    };

    void bootstrap();
  }, [applyWorkspaceState, initialAssembly, initialOrders, initialShippedArchive, pushToServer, runSync]);

  useEffect(() => {
    return subscribeWorkspaceStream({
      onWorkspace: applyFromServer,
      onConnectionChange: setIsStreamConnected,
      onRevisionPing: (revision) => {
        setServerRevision(revision);
        if (revision !== revisionRef.current) {
          pullRemoteRef.current();
        }
      },
    });
  }, [applyFromServer]);

  useEffect(() => {
    const pollRevision = () => {
      void fetchWorkspaceRevision()
        .then((revision) => {
          setServerRevision(revision);
          if (revision !== revisionRef.current) {
            pullRemoteRef.current();
          }
        })
        .catch(() => {
          // next poll retries
        });
    };

    pollRevision();
    const interval = setInterval(pollRevision, REVISION_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return subscribeServerReachability((reachable) => {
      setIsServerReachable(reachable);
      serverReachableRef.current = reachable;
      if (reachable) {
        pullRemoteRef.current();
        void runSync();
      }
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
