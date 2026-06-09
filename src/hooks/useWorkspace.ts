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
  createWorkspace,
  fetchSharedWorkspace,
  fetchWorkspaceRevision,
  flushSyncQueue,
  getClientId,
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

function readLocalSnapshot(
  initialAssembly: AssemblyItem[],
  initialOrders: ShippingOrder[],
  initialShippedArchive: ShippingOrder[],
) {
  const local = loadWorkspace();
  if (!local) {
    return {
      assemblyItems: initialAssembly,
      orders: initialOrders,
      shippedArchive: collectShippedArchive(initialOrders, initialShippedArchive),
      apiOrderIds: [] as string[],
      revision: 0,
    };
  }

  const normalized = normalizeWorkspaceState(local);
  return {
    assemblyItems: normalized.assemblyItems,
    orders: normalized.orders,
    shippedArchive: normalized.shippedArchive ?? [],
    apiOrderIds: normalized.apiOrderIds ?? [],
    revision: (local as SharedWorkspaceState).revision ?? 0,
  };
}

export function useWorkspace({
  initialAssembly,
  initialOrders,
  initialApiOrderIds = [],
  initialShippedArchive = [],
}: UseWorkspaceOptions) {
  const snapshot = readLocalSnapshot(initialAssembly, initialOrders, initialShippedArchive);

  const revisionRef = useRef(snapshot.revision);
  const bootstrappedRef = useRef(false);
  const pullingRef = useRef(false);
  const pushingRef = useRef(false);
  const assemblyRef = useRef(snapshot.assemblyItems);
  const ordersRef = useRef(snapshot.orders);
  const shippedArchiveRef = useRef(snapshot.shippedArchive);
  const serverReachableRef = useRef(true);
  const pushChainRef = useRef(Promise.resolve());
  const pullRemoteRef = useRef<() => void>(() => {});

  const [assemblyItems, setAssemblyItems] = useState(snapshot.assemblyItems);
  const [orders, setOrders] = useState(snapshot.orders);
  const [shippedArchive, setShippedArchive] = useState(snapshot.shippedArchive);
  const [apiOrderIds, setApiOrderIds] = useState(
    snapshot.apiOrderIds.length ? snapshot.apiOrderIds : initialApiOrderIds,
  );
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
  const [serverRevision, setServerRevision] = useState(snapshot.revision);
  const [clientRevision, setClientRevision] = useState(snapshot.revision);

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
      if (remote.revision <= revisionRef.current) return;
      if (pushingRef.current) return;

      applyWorkspaceState(normalizeWorkspaceState(remote));
    },
    [applyWorkspaceState],
  );

  const pushToServer = useCallback(
    (workspace: ReturnType<typeof createWorkspace>) => {
      pushChainRef.current = pushChainRef.current
        .then(async () => {
          pushingRef.current = true;
          setIsSyncing(true);
          try {
            const result = await pushWorkspace(workspace);
            if (result.workspace) {
              applyFromServer(result.workspace);
            } else {
              serverReachableRef.current = await checkServerReachable();
              setIsServerReachable(serverReachableRef.current);
            }
            setPendingSync(getPendingSyncCount());
          } finally {
            pushingRef.current = false;
            setIsSyncing(false);
          }
        })
        .catch(() => {
          pushingRef.current = false;
          setIsSyncing(false);
          setPendingSync(getPendingSyncCount());
        });

      return pushChainRef.current;
    },
    [applyFromServer],
  );

  const pullRemote = useCallback(() => {
    if (pullingRef.current || pushingRef.current) return;
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
      if (options?.push) {
        void pushToServer(normalizeWorkspaceState(remote));
      }
    },
    [applyWorkspaceState, pushToServer],
  );

  const persist = useCallback(
    (assembly: AssemblyItem[], ords: ShippingOrder[]) => {
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
      } else if (result.synced > 0) {
        setLastSyncAt(Date.now());
      }
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [applyFromServer]);

  useEffect(() => {
    const local = loadWorkspace();
    if (!local) return;
    const normalized = normalizeWorkspaceState(local);
    shippedArchiveRef.current = normalized.shippedArchive ?? [];
    assemblyRef.current = normalized.assemblyItems;
    ordersRef.current = normalized.orders;
    setAssemblyItems([...normalized.assemblyItems]);
    setOrders([...normalized.orders]);
    setShippedArchive(normalized.shippedArchive ?? []);
    setApiOrderIds(normalized.apiOrderIds ?? initialApiOrderIds);
  }, [initialApiOrderIds]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const bootstrap = async () => {
      const reachable = await checkServerReachable();
      setIsServerReachable(reachable);
      serverReachableRef.current = reachable;

      await runSync();

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
      const fallback = createWorkspace(initialAssembly, initialOrders, initialShippedArchive);

      if (remote && local) {
        const merged = normalizeWorkspaceState(applySharedWorkspace(local, remote));
        applyWorkspaceState(merged);
        if (local.updatedAt > remote.updatedAt) {
          await pushToServer(merged);
        }
      } else if (remote) {
        const merged = normalizeWorkspaceState(applySharedWorkspace(fallback, remote));
        applyWorkspaceState(merged);
      } else if (local) {
        applyWorkspaceState(normalizeWorkspaceState(local as SharedWorkspaceState));
        await pushToServer(local);
      } else if (!fetchFailed) {
        applyWorkspaceState(
          normalizeWorkspaceState({
            ...fallback,
            revision: 0,
            updatedBy: getClientId(),
          } as SharedWorkspaceState),
        );
      }

      setSyncReady(true);
      setPendingSync(getPendingSyncCount());
    };

    void bootstrap();
  }, [applyWorkspaceState, initialAssembly, initialOrders, initialShippedArchive, pushToServer, runSync]);

  useEffect(() => {
    return subscribeWorkspaceStream({
      onWorkspace: applyFromServer,
      onConnectionChange: setIsStreamConnected,
      onRevisionPing: (revision) => {
        setServerRevision(revision);
        if (revision !== revisionRef.current && !pushingRef.current) {
          pullRemoteRef.current();
        }
      },
    });
  }, [applyFromServer]);

  useEffect(() => {
    const pollRevision = () => {
      if (pushingRef.current) return;
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
      persist(items, ordersRef.current);
    },
    [persist],
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
      persist(assembly, resolved);
    },
    [persist],
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
