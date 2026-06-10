import { io, type Socket } from "socket.io-client";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState, WorkspaceState } from "@/types/workspace";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
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
  assemblyCount?: number;
}> {
  try {
    logClientSync("refresh.start");
    const res = await fetchWithTimeout("/api/workspace/refresh", {
      method: "POST",
      cache: "no-store",
      timeoutMs: 60_000,
    });

    const data = (await res.json()) as {
      ok: boolean;
      workspace?: SharedWorkspaceState;
      error?: string;
      ordersCount?: number;
      assemblyCount?: number;
    };

    if (!res.ok || !data.ok) {
      logClientSync("refresh.fail", { message: data.error, meta: { status: res.status } });
      return { ok: false, error: data.error ?? "Не удалось обновить данные" };
    }

    logClientSync("refresh.ok", {
      meta: { ordersCount: data.ordersCount, assemblyCount: data.assemblyCount },
    });

    return {
      ok: true,
      workspace: data.workspace,
      ordersCount: data.ordersCount,
      assemblyCount: data.assemblyCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    logClientSync("refresh.fail", { message });
    return {
      ok: false,
      error: "Не удалось связаться с сервером. Проверь Wi‑Fi и что otpravki запущен.",
    };
  }
}

const SYNC_TIMEOUT_MS = 20_000;

function cacheBust(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${Date.now()}`;
}

export async function fetchWorkspaceRevision(): Promise<number> {
  const res = await fetchWithTimeout(cacheBust("/api/workspace/revision"), {
    cache: "no-store",
    timeoutMs: SYNC_TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`revision fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { revision: number };
  return data.revision;
}

export async function fetchSharedWorkspace(): Promise<SharedWorkspaceState | null> {
  const res = await fetchWithTimeout(cacheBust("/api/workspace"), {
    cache: "no-store",
    timeoutMs: SYNC_TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`workspace fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { workspace: SharedWorkspaceState | null };
  return data.workspace;
}

let activeSocket: Socket | null = null;

export function logClientSync(
  type: string,
  data: { message?: string; revision?: number; meta?: Record<string, unknown> } = {},
) {
  void fetch("/api/sync/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      clientId: getClientId(),
      message: data.message,
      revision: data.revision,
      meta: data.meta,
    }),
    keepalive: true,
  }).catch(() => {
    // logging must not break sync
  });
}

export async function pushWorkspace(workspace: WorkspaceState): Promise<{
  ok: boolean;
  workspace?: SharedWorkspaceState;
}> {
  const payload = {
    workspace,
    clientId: getClientId(),
  };

  if (activeSocket?.connected) {
    activeSocket.emit("workspace:set", payload);
  }

  try {
    const res = await fetchWithTimeout("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      timeoutMs: SYNC_TIMEOUT_MS,
    });

    const data = (await res.json()) as {
      ok: boolean;
      workspace?: SharedWorkspaceState;
    };

    if (!res.ok) {
      logClientSync("push.http.error", { meta: { status: res.status } });
      enqueueSync(workspace);
      return { ok: false };
    }

    if (data.ok) {
      logClientSync("push.http.ok", { revision: data.workspace?.revision });
      clearSyncQueue();
    }
    return data;
  } catch (err) {
    logClientSync("push.http.fail", {
      message: err instanceof Error ? err.message : "fetch failed",
    });
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
  onRevisionPing?: (revision: number) => void;
}

const SOCKET_RECONNECT_MS = 300;

function applyWorkspaceEvent(
  workspace: SharedWorkspaceState | undefined,
  onWorkspace: (workspace: SharedWorkspaceState) => void,
  onRevisionPing?: (revision: number) => void,
) {
  if (!workspace) return;
  onWorkspace(workspace);
  if (typeof workspace.revision === "number") {
    onRevisionPing?.(workspace.revision);
  }
}

export function subscribeWorkspaceStream({
  onWorkspace,
  onConnectionChange,
  onRevisionPing,
}: WorkspaceStreamOptions): () => void {
  let connected = false;
  let closed = false;

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
        // retry on next reconnect
      });
  };

  const socket = io({
    path: "/socket.io",
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionDelay: SOCKET_RECONNECT_MS,
    reconnectionAttempts: Infinity,
  });
  activeSocket = socket;

  socket.on("connect", () => {
    setConnected(true);
    logClientSync("socket.connect", { meta: { transport: socket.io.engine.transport.name } });
  });
  socket.on("disconnect", (reason) => {
    setConnected(false);
    logClientSync("socket.disconnect", { message: reason });
  });
  socket.on("workspace:sync", (workspace: SharedWorkspaceState) => {
    logClientSync("recv.sync", { revision: workspace?.revision });
    applyWorkspaceEvent(workspace, onWorkspace, onRevisionPing);
  });
  socket.on("workspace:update", (workspace: SharedWorkspaceState) => {
    logClientSync("recv.update", { revision: workspace?.revision });
    applyWorkspaceEvent(workspace, onWorkspace, onRevisionPing);
  });

  const reconnectNow = () => {
    if (closed) return;
    refreshFromServer();
    if (!socket.connected) socket.connect();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") reconnectNow();
  };

  window.addEventListener("focus", reconnectNow);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    closed = true;
    socket.disconnect();
    if (activeSocket === socket) activeSocket = null;
    setConnected(false);
    window.removeEventListener("focus", reconnectNow);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
