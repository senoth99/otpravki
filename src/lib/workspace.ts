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

function clearSyncQueue() {
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
  if (!res.ok) return null;
  const data = (await res.json()) as { workspace: SharedWorkspaceState | null };
  return data.workspace;
}

export async function pushWorkspace(workspace: WorkspaceState): Promise<{
  ok: boolean;
  workspace?: SharedWorkspaceState;
}> {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, clientId: getClientId() }),
  });

  if (!res.ok) {
    enqueueSync(workspace);
    return { ok: false };
  }

  const data = (await res.json()) as { ok: boolean; workspace?: SharedWorkspaceState };
  if (data.ok) clearSyncQueue();
  return data;
}

export async function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return { synced: 0, failed: 0 };

    const queue = JSON.parse(raw) as { workspace: WorkspaceState }[];
    if (queue.length === 0) return { synced: 0, failed: 0 };

    const latest = queue[queue.length - 1].workspace;
    const result = await pushWorkspace(latest);
    if (result.ok) {
      clearSyncQueue();
      return { synced: 1, failed: 0 };
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

export function subscribeWorkspaceStream(
  onWorkspace: (workspace: SharedWorkspaceState) => void,
): () => void {
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const refreshFromServer = () => {
    void fetchSharedWorkspace().then((workspace) => {
      if (workspace) onWorkspace(workspace);
    });
  };

  const connect = () => {
    if (closed) return;

    source?.close();
    source = new EventSource("/api/workspace/stream");

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          workspace: SharedWorkspaceState;
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
      if (closed) return;
      refreshFromServer();
      reconnectTimer = setTimeout(connect, 2000);
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    source?.close();
  };
}
