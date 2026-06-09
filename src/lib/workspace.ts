import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState, WorkspaceState } from "@/types/workspace";
import { mergeShippedArchives } from "@/lib/shipped-archive";
import { mergeWorkspaces } from "@/lib/workspace-merge";

const WORKSPACE_KEY = "otpravki-workspace-v1";
const SYNC_QUEUE_KEY = "otpravki-sync-queue-v1";
const CLIENT_ID_KEY = "otpravki-client-id";
const RESET_TOKEN_KEY = "otpravki-reset-token";

export type { WorkspaceState, SharedWorkspaceState };

export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function loadWorkspace(): WorkspaceState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return null;
  }
}

export function saveWorkspace(state: WorkspaceState) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
}

export function clearLocalWorkspace() {
  localStorage.removeItem(WORKSPACE_KEY);
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

export function syncResetToken(serverToken: string | undefined) {
  if (!serverToken) return false;

  const localToken = localStorage.getItem(RESET_TOKEN_KEY);
  if (localToken === serverToken) return false;

  clearLocalWorkspace();
  localStorage.setItem(RESET_TOKEN_KEY, serverToken);
  return true;
}

export function enqueueSync(workspace: WorkspaceState) {
  localStorage.setItem(
    SYNC_QUEUE_KEY,
    JSON.stringify([
      {
        id: `${workspace.updatedAt}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        workspace,
      },
    ]),
  );
}

export function getPendingSyncCount(): number {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    const queue = raw ? (JSON.parse(raw) as unknown[]) : [];
    return queue.length;
  } catch {
    return 0;
  }
}

export function clearSyncQueue() {
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

export async function refreshWorkspaceFromApi(): Promise<{
  ok: boolean;
  workspace?: SharedWorkspaceState;
  error?: string;
  ordersCount?: number;
}> {
  try {
    const res = await fetch("/api/workspace/refresh", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });

    const data = (await res.json()) as {
      ok: boolean;
      workspace?: SharedWorkspaceState;
      error?: string;
      ordersCount?: number;
    };

    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? "Не удалось обновить данные" };
    }

    return {
      ok: true,
      workspace: data.workspace,
      ordersCount: data.ordersCount,
    };
  } catch {
    return {
      ok: false,
      error: "Не удалось связаться с сервером. Проверь Wi‑Fi и что otpravki запущен.",
    };
  }
}

export async function fetchSharedWorkspace(): Promise<SharedWorkspaceState | null> {
  const res = await fetch("/api/workspace", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`workspace fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { workspace: SharedWorkspaceState | null };
  return data.workspace;
}

export async function pushWorkspace(workspace: WorkspaceState): Promise<{
  ok: boolean;
  workspace?: SharedWorkspaceState;
}> {
  try {
    const res = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, clientId: getClientId() }),
      cache: "no-store",
    });

    if (!res.ok) {
      enqueueSync(workspace);
      return { ok: false };
    }

    const data = (await res.json()) as { ok: boolean; workspace?: SharedWorkspaceState };
    if (data.ok) clearSyncQueue();
    return data;
  } catch {
    enqueueSync(workspace);
    return { ok: false };
  }
}

export async function flushSyncQueue(): Promise<{
  synced: number;
  failed: number;
  workspace?: SharedWorkspaceState;
}> {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return { synced: 0, failed: 0 };

    const queue = JSON.parse(raw) as { workspace: WorkspaceState }[];
    if (queue.length === 0) return { synced: 0, failed: 0 };

    const local = loadWorkspace();
    const queued = queue[queue.length - 1].workspace;
    const toPush =
      local && local.updatedAt > queued.updatedAt
        ? local
        : queued;

    const result = await pushWorkspace(toPush);
    if (result.ok) {
      clearSyncQueue();
      return { synced: 1, failed: 0, workspace: result.workspace };
    }
    return { synced: 0, failed: 1 };
  } catch {
    return { synced: 0, failed: 1 };
  }
}

export function applySharedWorkspace(
  current: WorkspaceState,
  remote: SharedWorkspaceState,
): SharedWorkspaceState {
  const merged = mergeWorkspaces(current, remote);
  return {
    ...merged,
    revision: remote.revision,
    updatedBy: remote.updatedBy,
    apiOrderIds: remote.apiOrderIds ?? merged.apiOrderIds,
    shippedArchive: mergeShippedArchives(
      merged.shippedArchive ?? [],
      remote.shippedArchive ?? [],
      merged.orders,
      remote.orders,
    ),
  };
}

export function createWorkspace(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
  shippedArchive?: ShippingOrder[],
): WorkspaceState {
  return {
    version: 1,
    assemblyItems,
    orders,
    shippedArchive: mergeShippedArchives(shippedArchive ?? [], orders),
    updatedAt: Date.now(),
  };
}

export interface WorkspaceStreamOptions {
  onWorkspace: (workspace: SharedWorkspaceState) => void;
  onConnectionChange?: (connected: boolean) => void;
}

const STREAM_RECONNECT_MS = 300;
const STREAM_STALE_MS = 10_000;

export function subscribeWorkspaceStream({
  onWorkspace,
  onConnectionChange,
}: WorkspaceStreamOptions): () => void {
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let staleTimer: ReturnType<typeof setInterval> | null = null;
  let connected = false;
  let closed = false;
  let lastMessageAt = Date.now();

  const setConnected = (next: boolean) => {
    if (connected === next) return;
    connected = next;
    onConnectionChange?.(next);
  };

  const refreshFromServer = () => {
    void fetchSharedWorkspace()
      .then((workspace) => {
        if (workspace) onWorkspace(workspace);
      })
      .catch(() => {
        // retry on next reconnect or poll
      });
  };

  const clearStaleTimer = () => {
    if (staleTimer) {
      clearInterval(staleTimer);
      staleTimer = null;
    }
  };

  const startStaleTimer = () => {
    clearStaleTimer();
    staleTimer = setInterval(() => {
      if (closed || !connected) return;
      if (Date.now() - lastMessageAt > STREAM_STALE_MS) {
        source?.close();
        source = null;
        setConnected(false);
        refreshFromServer();
        scheduleReconnect();
      }
    }, 2_000);
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, STREAM_RECONNECT_MS);
  };

  const connect = () => {
    if (closed) return;

    source?.close();
    source = new EventSource("/api/workspace/stream");

    source.onopen = () => {
      lastMessageAt = Date.now();
      setConnected(true);
      startStaleTimer();
    };

    source.onmessage = (event) => {
      lastMessageAt = Date.now();
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          workspace?: SharedWorkspaceState;
        };
        if (data.type === "workspace" && data.workspace) {
          onWorkspace(data.workspace);
        }
      } catch {
        // ignore malformed events
      }
    };

    source.onerror = () => {
      source?.close();
      source = null;
      clearStaleTimer();
      setConnected(false);
      if (closed) return;
      refreshFromServer();
      scheduleReconnect();
    };
  };

  const reconnectNow = () => {
    if (closed) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    refreshFromServer();
    if (!connected) connect();
  };

  connect();

  const onVisible = () => {
    if (document.visibilityState === "visible") reconnectNow();
  };

  window.addEventListener("focus", reconnectNow);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    clearStaleTimer();
    source?.close();
    setConnected(false);
    window.removeEventListener("focus", reconnectNow);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
