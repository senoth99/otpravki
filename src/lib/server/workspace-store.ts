import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { mergeShippedArchives, normalizeWorkspaceState } from "@/lib/shipped-archive";
import { mergeFreshOrdersData } from "@/lib/workspace-api-merge";
import { mergeWorkspaces } from "@/lib/workspace-merge";
import type { WorkspaceData } from "@/lib/build-workspace";
import { logSync } from "@/lib/server/sync-log";
import { appendSyncEvent, forwardToRemote } from "@/lib/server/sync-store";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const WORKSPACE_DIR = path.join(DATA_DIR, "workspace");
const STATE_FILE = path.join(WORKSPACE_DIR, "state.json");

type WorkspaceListener = (state: SharedWorkspaceState) => void;

const listeners = new Set<WorkspaceListener>();

let memoryState: SharedWorkspaceState | null = null;

async function readFromDisk(): Promise<SharedWorkspaceState | null> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw) as SharedWorkspaceState;
  } catch {
    return null;
  }
}

async function writeToDisk(state: SharedWorkspaceState) {
  await mkdir(WORKSPACE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state), "utf-8");
}

function broadcast(state: SharedWorkspaceState) {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // dead SSE connection — removed on abort
    }
  }

  const io =
    (global as { __workspaceIo?: { emit: (event: string, data: unknown) => void } }).__workspaceIo ??
    (globalThis as { __workspaceIo?: { emit: (event: string, data: unknown) => void } })
      .__workspaceIo;
  if (io) {
    io.emit("workspace:update", state);
    void logSync("broadcast.socket", {
      revision: state.revision,
      updatedBy: state.updatedBy,
      orders: state.orders.length,
    });
  } else {
    void logSync("broadcast.no-socket", {
      revision: state.revision,
      updatedBy: state.updatedBy,
      orders: state.orders.length,
      hint: "Запускай через npm run dev / node server.js, не next dev",
    });
  }
}

let updateChain = Promise.resolve();

function enqueueWorkspaceUpdate<T>(task: () => Promise<T>): Promise<T> {
  const run = updateChain.then(task, task);
  updateChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function subscribeWorkspace(listener: WorkspaceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getWorkspaceRevision(): Promise<number> {
  const state = await getSharedWorkspace();
  return state?.revision ?? 0;
}

export async function getSharedWorkspace(): Promise<SharedWorkspaceState | null> {
  if (memoryState) return memoryState;

  const disk = await readFromDisk();
  if (!disk) return null;

  const normalized = normalizeWorkspaceState(disk);
  memoryState = normalized;

  if (
    disk.orders.length !== normalized.orders.length ||
    (disk.shippedArchive?.length ?? 0) !== (normalized.shippedArchive?.length ?? 0)
  ) {
    await writeToDisk(normalized);
  }

  return memoryState;
}

function isStaleMockWorkspace(
  existing: SharedWorkspaceState,
  resetToken: string | null,
): boolean {
  if (!resetToken) return false;
  return existing.resetToken !== resetToken;
}

export async function resetSharedWorkspace(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
  resetToken?: string,
): Promise<SharedWorkspaceState> {
  const state: SharedWorkspaceState = {
    version: 1,
    revision: 1,
    assemblyItems,
    orders,
    shippedArchive: mergeShippedArchives(orders),
    apiOrderIds: orders.filter((order) => !order.barcodePrinted).map((order) => order.id),
    updatedAt: Date.now(),
    updatedBy: "server",
    resetToken,
  };

  memoryState = state;
  await writeToDisk(state);
  broadcast(state);
  return state;
}

export async function syncWorkspaceFromApi(fresh: WorkspaceData): Promise<SharedWorkspaceState> {
  const existing = await getSharedWorkspace();

  const next: SharedWorkspaceState = normalizeWorkspaceState(
    existing
      ? {
          ...mergeFreshOrdersData(existing, fresh),
          revision: existing.revision + 1,
          updatedBy: "api-sync",
        }
      : {
          version: 1,
          revision: 1,
          assemblyItems: fresh.assemblyItems,
          orders: fresh.orders,
          shippedArchive: [],
          apiOrderIds: fresh.orders.map((order) => order.id),
          updatedAt: Date.now(),
          updatedBy: "server",
        },
  );

  memoryState = next;
  await writeToDisk(next);
  broadcast(next);
  return next;
}

export async function initSharedWorkspace(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
  resetToken?: string,
): Promise<SharedWorkspaceState> {
  const existing = await getSharedWorkspace();
  if (existing && !isStaleMockWorkspace(existing, resetToken ?? null)) {
    return existing;
  }

  return resetSharedWorkspace(assemblyItems, orders, resetToken);
}

async function applyWorkspaceUpdateInner(
  incoming: SharedWorkspaceState | Omit<SharedWorkspaceState, "revision">,
  clientId: string,
): Promise<SharedWorkspaceState> {
  const current = await getSharedWorkspace();

  const mergedBase =
    !current || incoming.updatedAt >= current.updatedAt
      ? {
          version: 1 as const,
          assemblyItems: incoming.assemblyItems,
          orders: incoming.orders,
          shippedArchive: mergeShippedArchives(
            incoming.shippedArchive ?? [],
            incoming.orders,
            current?.shippedArchive ?? [],
            current?.orders ?? [],
          ),
          apiOrderIds: incoming.apiOrderIds ?? current?.apiOrderIds,
          updatedAt: incoming.updatedAt,
        }
      : mergeWorkspaces(current, incoming);

  const next: SharedWorkspaceState = normalizeWorkspaceState({
    ...mergedBase,
    revision: (current?.revision ?? 0) + 1,
    updatedAt: Date.now(),
    updatedBy: clientId,
  });

  memoryState = next;
  await writeToDisk(next);
  broadcast(next);

  void logSync("workspace.update", {
    revision: next.revision,
    updatedBy: clientId,
    orders: next.orders.length,
    assembly: next.assemblyItems.length,
  });
  void appendSyncEvent(next).then(() => forwardToRemote(next));

  return next;
}

export function applyWorkspaceUpdate(
  incoming: SharedWorkspaceState | Omit<SharedWorkspaceState, "revision">,
  clientId: string,
): Promise<SharedWorkspaceState> {
  return enqueueWorkspaceUpdate(() => applyWorkspaceUpdateInner(incoming, clientId));
}
