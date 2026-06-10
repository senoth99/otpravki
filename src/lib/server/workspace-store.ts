import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { mergeShippedArchives, normalizeWorkspaceState, unionPermanentArchive } from "@/lib/shipped-archive";
import { mergeWorkspaces } from "@/lib/workspace-merge";
import type { WorkspaceData } from "@/lib/build-workspace";
import { mergePersistedArchive } from "@/lib/server/shipped-archive-store";
import {
  applySessionProgress,
  loadSessionProgress,
  saveSessionProgress,
} from "@/lib/server/session-progress-store";
import { mergeFreshOrdersData } from "@/lib/workspace-api-merge";
import { logSync } from "@/lib/server/sync-log";
import { appendSyncEvent, forwardToRemote } from "@/lib/server/sync-store";

type WorkspaceListener = (state: SharedWorkspaceState) => void;

const listeners = new Set<WorkspaceListener>();

let memoryState: SharedWorkspaceState | null = null;

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
  return memoryState?.revision ?? 0;
}

/** Только оперативная сессия — без чтения с диска */
export async function getSharedWorkspace(): Promise<SharedWorkspaceState | null> {
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
  broadcast(state);
  return state;
}

/** Обновить архив в оперативной сессии после записи на диск */
export async function replaceSessionArchive(shippedArchive: ShippingOrder[]): Promise<void> {
  if (!memoryState) return;

  memoryState = normalizeWorkspaceState({
    ...memoryState,
    shippedArchive,
    revision: memoryState.revision + 1,
    updatedAt: Date.now(),
    updatedBy: "archive-sync",
  });
  broadcast(memoryState);
}

/** Свежие заказы с API + архив + сохранённый прогресс сборки/сканов */
export async function replaceWorkspaceFromApi(fresh: WorkspaceData): Promise<SharedWorkspaceState> {
  const shippedArchive = await mergePersistedArchive(memoryState?.shippedArchive ?? []);
  const sessionProgress = memoryState ? null : await loadSessionProgress();

  const mergeBase: SharedWorkspaceState = memoryState ?? {
    version: 1,
    revision: 0,
    assemblyItems: [],
    orders: [],
    shippedArchive,
    apiOrderIds: [],
    updatedAt: 0,
    updatedBy: "server",
  };

  let next = normalizeWorkspaceState(
    mergeFreshOrdersData({ ...mergeBase, shippedArchive }, fresh),
  );
  next = applySessionProgress(next, sessionProgress);
  next = {
    ...next,
    revision: (memoryState?.revision ?? 0) + 1,
    updatedAt: Date.now(),
    updatedBy: "api-sync",
  };

  memoryState = next;
  await saveSessionProgress(next);
  broadcast(next);
  return next;
}

export async function initSharedWorkspace(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
  resetToken?: string,
): Promise<SharedWorkspaceState> {
  const existing = memoryState;
  if (existing && !isStaleMockWorkspace(existing, resetToken ?? null)) {
    return existing;
  }

  return resetSharedWorkspace(assemblyItems, orders, resetToken);
}

async function applyWorkspaceUpdateInner(
  incoming: SharedWorkspaceState | Omit<SharedWorkspaceState, "revision">,
  clientId: string,
): Promise<SharedWorkspaceState> {
  const current = memoryState;

  const mergedBase =
    !current || incoming.updatedAt >= current.updatedAt
      ? {
          version: 1 as const,
          assemblyItems: incoming.assemblyItems,
          orders: incoming.orders,
          shippedArchive: unionPermanentArchive(
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

  next.shippedArchive = await mergePersistedArchive(next.shippedArchive ?? []);

  memoryState = next;
  await saveSessionProgress(next);
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
