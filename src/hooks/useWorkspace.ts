"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { reconcileAssemblyOnShip } from "@/lib/assembly-demand";
import {
  applySharedWorkspace,
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
}

export function useWorkspace({
  initialAssembly,
  initialOrders,
  initialApiOrderIds = [],
}: UseWorkspaceOptions) {
  const hydrated = useRef(false);
  const revisionRef = useRef(0);
  const applyingRemote = useRef(false);
  const assemblyRef = useRef(initialAssembly);
  const ordersRef = useRef(initialOrders);

  const [assemblyItems, setAssemblyItems] = useState(initialAssembly);
  const [orders, setOrders] = useState(initialOrders);
  const [apiOrderIds, setApiOrderIds] = useState(initialApiOrderIds);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  assemblyRef.current = assemblyItems;
  ordersRef.current = orders;

  const replaceWorkspace = useCallback((remote: SharedWorkspaceState) => {
    applyingRemote.current = true;
    revisionRef.current = remote.revision;
    setAssemblyItems(remote.assemblyItems);
    setOrders(remote.orders);
    setApiOrderIds(remote.apiOrderIds ?? []);
    saveWorkspace(remote);

    queueMicrotask(() => {
      applyingRemote.current = false;
    });
    setLastSyncAt(Date.now());
    setPendingSync(getPendingSyncCount());
  }, []);

  const applyRemote = useCallback((remote: SharedWorkspaceState) => {
    if (remote.revision <= revisionRef.current) return;

    applyingRemote.current = true;
    revisionRef.current = remote.revision;

    const local = createWorkspace(assemblyRef.current, ordersRef.current);
    const merged = applySharedWorkspace(local, remote);

    setAssemblyItems(merged.assemblyItems);
    setOrders(merged.orders);
    setApiOrderIds(merged.apiOrderIds ?? []);
    saveWorkspace(merged);

    queueMicrotask(() => {
      applyingRemote.current = false;
    });
    setLastSyncAt(Date.now());
    setPendingSync(getPendingSyncCount());
  }, []);

  const pushToServer = useCallback(async (workspace: ReturnType<typeof createWorkspace>) => {
    if (!navigator.onLine) {
      setPendingSync(getPendingSyncCount());
      return;
    }

    setIsSyncing(true);
    try {
      const result = await pushWorkspace(workspace);
      if (result.workspace) {
        applyRemote(result.workspace);
      }
      setPendingSync(getPendingSyncCount());
    } finally {
      setIsSyncing(false);
    }
  }, [applyRemote]);

  const persist = useCallback(
    (assembly: AssemblyItem[], ords: ShippingOrder[]) => {
      if (applyingRemote.current) return;

      const workspace = createWorkspace(assembly, ords);
      saveWorkspace(workspace);
      void pushToServer(workspace);
    },
    [pushToServer],
  );

  const runSync = useCallback(async () => {
    if (!navigator.onLine) return { synced: 0, failed: 0 };
    setIsSyncing(true);
    try {
      const result = await flushSyncQueue();
      setPendingSync(getPendingSyncCount());
      if (result.synced > 0) setLastSyncAt(Date.now());
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const remote = await fetchSharedWorkspace();
      if (remote?.resetToken) {
        syncResetToken(remote.resetToken);
      }

      const local = loadWorkspace();

      if (remote) {
        const base = local ?? createWorkspace(initialAssembly, initialOrders);
        const merged = applySharedWorkspace(base, remote);
        revisionRef.current = merged.revision;
        setAssemblyItems(merged.assemblyItems);
        setOrders(merged.orders);
        setApiOrderIds(merged.apiOrderIds ?? []);
        saveWorkspace(merged);
      } else if (local) {
        setAssemblyItems(local.assemblyItems);
        setOrders(local.orders);
        setApiOrderIds(local.apiOrderIds ?? []);
        void pushToServer(local);
      }

      hydrated.current = true;
      setPendingSync(getPendingSyncCount());
      setIsOnline(navigator.onLine);
      void runSync();
    };

    void bootstrap();
  }, [initialAssembly, initialOrders, pushToServer, runSync]);

  useEffect(() => {
    return subscribeWorkspaceStream((workspace) => {
      applyRemote(workspace);
    });
  }, [applyRemote]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void runSync();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [runSync]);

  const updateAssembly = useCallback(
    (items: AssemblyItem[]) => {
      assemblyRef.current = items;
      setAssemblyItems(items);
      if (hydrated.current) persist(items, ordersRef.current);
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
        replaceWorkspace(result.workspace);
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
      if (hydrated.current) persist(assembly, resolved);
    },
    [persist],
  );

  return {
    assemblyItems,
    orders,
    apiOrderIds,
    updateAssembly,
    updateOrders,
    isOnline,
    isSyncing,
    isRefreshing,
    pendingSync,
    lastSyncAt,
    syncNow: runSync,
    refreshFromApi,
  };
}
