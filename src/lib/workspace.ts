import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState, WorkspaceState } from "@/types/workspace";
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
  };
}

export function createWorkspace(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
): WorkspaceState {
  return {
    version: 1,
    assemblyItems,
    orders,
    updatedAt: Date.now(),
  };
}

export function subscribeWorkspaceStream(
  onWorkspace: (workspace: SharedWorkspaceState) => void,
): () => void {
  const source = new EventSource("/api/workspace/stream");

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

  return () => source.close();
}
