import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState, WorkspaceState } from "@/types/workspace";
import { mutatingApiHeaders } from "@/lib/api-headers";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { acquireRealtimeSocket, releaseRealtimeSocket } from "@/lib/realtime-socket";
import { mergeShippedArchives } from "@/lib/shipped-archive";

const CLIENT_ID_KEY = "otpravki-client-id";

export type { WorkspaceState, SharedWorkspaceState };

/** randomUUID нет на HTTP (LAN) и в старых Chromium — делаем fallback. */
function createClientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = createClientId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

const SYNC_TIMEOUT_MS = 45_000;

function cacheBust(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${Date.now()}`;
}

export async function fetchSharedWorkspace(options?: {
  slim?: "assembly";
}): Promise<SharedWorkspaceState | null> {
  const path = options?.slim === "assembly" ? "/api/workspace?slim=assembly" : "/api/workspace";
  const res = await fetchWithTimeout(cacheBust(path), {
    cache: "no-store",
    timeoutMs: SYNC_TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`workspace fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { workspace: SharedWorkspaceState | null };
  return data.workspace;
}

export function logClientSync(
  type: string,
  data: { message?: string; revision?: number; meta?: Record<string, unknown> } = {},
) {
  void fetch("/api/sync/log", {
    method: "POST",
    headers: mutatingApiHeaders(),
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

export async function refreshWorkspaceFromApi(
  brand?: string,
  options?: { slim?: "assembly"; fresh?: boolean },
): Promise<{
  ok: boolean;
  workspace?: SharedWorkspaceState;
  error?: string;
}> {
  try {
    const payload: { brand?: string; slim?: "assembly"; fresh?: boolean } = {};
    if (brand) payload.brand = brand;
    if (options?.slim) payload.slim = options.slim;
    if (options?.fresh) payload.fresh = true;
    const res = await fetchWithTimeout("/api/workspace/refresh", {
      method: "POST",
      headers: mutatingApiHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
      timeoutMs: SYNC_TIMEOUT_MS,
    });

    const data = (await res.json()) as {
      ok: boolean;
      workspace?: SharedWorkspaceState;
      error?: string;
    };

    if (!res.ok || !data.ok) {
      logClientSync("refresh.http.error", {
        meta: { status: res.status, brand, error: data.error },
      });
      return { ok: false, error: data.error ?? `refresh failed: ${res.status}` };
    }

    logClientSync("refresh.http.ok", {
      revision: data.workspace?.revision,
      meta: { brand },
    });
    return { ok: true, workspace: data.workspace };
  } catch (err) {
    logClientSync("refresh.http.fail", {
      message: err instanceof Error ? err.message : "fetch failed",
      meta: { brand },
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

export async function pushWorkspace(workspace: WorkspaceState): Promise<{
  ok: boolean;
  workspace?: SharedWorkspaceState;
}> {
  const payload = {
    workspace,
    clientId: getClientId(),
  };

  try {
    const res = await fetchWithTimeout("/api/workspace", {
      method: "POST",
      headers: mutatingApiHeaders(),
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
      return { ok: false };
    }

    if (data.ok) {
      logClientSync("push.http.ok", { revision: data.workspace?.revision });
    }
    return data;
  } catch (err) {
    logClientSync("push.http.fail", {
      message: err instanceof Error ? err.message : "fetch failed",
    });
    return { ok: false };
  }
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
  onSync?: (workspace: SharedWorkspaceState) => void;
  onConnectionChange?: (connected: boolean) => void;
  slim?: "assembly";
  revision?: number;
}

export function subscribeWorkspaceStream({
  onWorkspace,
  onSync,
  onConnectionChange,
  slim,
  revision,
}: WorkspaceStreamOptions): () => void {
  let connected = false;

  const setConnected = (next: boolean) => {
    if (connected === next) return;
    connected = next;
    onConnectionChange?.(next);
  };

  const query: Record<string, string> = {};
  if (slim) query.slim = slim;
  if (typeof revision === "number" && revision > 0) query.revision = String(revision);

  const socket = acquireRealtimeSocket(query);

  const onConnect = () => {
    setConnected(true);
    logClientSync("socket.connect", { meta: { transport: socket.io.engine.transport.name } });
  };
  const onDisconnect = (reason: string) => {
    setConnected(false);
    logClientSync("socket.disconnect", { message: reason });
  };
  const onSyncEvent = (workspace: SharedWorkspaceState) => {
    logClientSync("recv.sync", { revision: workspace?.revision });
    if (workspace) (onSync ?? onWorkspace)(workspace);
  };
  const onUpdateEvent = (workspace: SharedWorkspaceState) => {
    logClientSync("recv.update", { revision: workspace?.revision });
    if (workspace) onWorkspace(workspace);
  };

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("workspace:sync", onSyncEvent);
  socket.on("workspace:update", onUpdateEvent);
  if (socket.connected) onConnect();

  return () => {
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("workspace:sync", onSyncEvent);
    socket.off("workspace:update", onUpdateEvent);
    releaseRealtimeSocket();
    setConnected(false);
  };
}
