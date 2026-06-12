import { io, type Socket } from "socket.io-client";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState, WorkspaceState } from "@/types/workspace";
import { mutatingApiHeaders } from "@/lib/api-headers";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { mergeShippedArchives } from "@/lib/shipped-archive";

const CLIENT_ID_KEY = "otpravki-client-id";

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

const SYNC_TIMEOUT_MS = 20_000;

function cacheBust(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${Date.now()}`;
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
}

const SOCKET_RECONNECT_MS = 300;

export function subscribeWorkspaceStream({
  onWorkspace,
  onSync,
  onConnectionChange,
}: WorkspaceStreamOptions): () => void {
  let connected = false;
  let closed = false;

  const setConnected = (next: boolean) => {
    if (connected === next) return;
    connected = next;
    onConnectionChange?.(next);
  };

  const apiSecret = process.env.NEXT_PUBLIC_OTPRAVKI_API_SECRET?.trim();
  const socket = io({
    path: "/socket.io",
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionDelay: SOCKET_RECONNECT_MS,
    reconnectionAttempts: Infinity,
    auth: apiSecret ? { secret: apiSecret } : undefined,
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
    if (workspace) (onSync ?? onWorkspace)(workspace);
  });
  socket.on("workspace:update", (workspace: SharedWorkspaceState) => {
    logClientSync("recv.update", { revision: workspace?.revision });
    if (workspace) onWorkspace(workspace);
  });

  return () => {
    closed = true;
    socket.disconnect();
    if (activeSocket === socket) activeSocket = null;
    setConnected(false);
  };
}
