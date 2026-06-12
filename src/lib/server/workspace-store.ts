import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { reconcileAssemblyChanges } from "@/lib/assembly-demand";
import { mergeShippedArchives, normalizeWorkspaceState } from "@/lib/shipped-archive";
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

export function enqueueWorkspaceUpdate<T>(task: () => Promise<T>): Promise<T> {
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

async function applySessionProgressToMemoryInner(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
): Promise<SharedWorkspaceState | null> {
  const current = memoryState;
  if (!current) return null;

  const progress = await loadSessionProgress();
  const merged = applySessionProgress({ ...current, assemblyItems, orders }, progress);
  const next: SharedWorkspaceState = {
    ...merged,
    revision: current.revision + 1,
    updatedAt: Date.now(),
    updatedBy: "session-progress",
  };

  await saveSessionProgress(next);
  memoryState = next;
  broadcast(next);
  return next;
}

export function applySessionProgressToMemory(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
): Promise<SharedWorkspaceState | null> {
  return enqueueWorkspaceUpdate(() => applySessionProgressToMemoryInner(assemblyItems, orders));
}

function isStaleMockWorkspace(
  existing: SharedWorkspaceState,
  resetToken: string | null,
): boolean {
  if (!resetToken) return false;
  return existing.resetToken !== resetToken;
}

async function resetSharedWorkspaceInner(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
  resetToken?: string,
): Promise<SharedWorkspaceState> {
  let shippedArchive = mergeShippedArchives(orders);
  try {
    shippedArchive = await mergePersistedArchive(shippedArchive);
  } catch {
    // архив на диске недоступен
  }
  const sessionProgress = await loadSessionProgress();

  let state: SharedWorkspaceState = normalizeWorkspaceState({
    version: 1,
    revision: 1,
    assemblyItems,
    orders,
    shippedArchive,
    apiOrderIds: orders.filter((order) => !order.barcodePrinted).map((order) => order.id),
    updatedAt: Date.now(),
    updatedBy: "server",
    resetToken,
  });
  state = applySessionProgress(state, sessionProgress);

  await saveSessionProgress(state);
  memoryState = state;
  broadcast(state);
  return state;
}

export function resetSharedWorkspace(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
  resetToken?: string,
): Promise<SharedWorkspaceState> {
  return enqueueWorkspaceUpdate(() => resetSharedWorkspaceInner(assemblyItems, orders, resetToken));
}

async function replaceSessionArchiveInner(shippedArchive: ShippingOrder[]): Promise<void> {
  if (!memoryState) return;

  const prevOrders = memoryState.orders;
  const nextOrders = prevOrders.map((order) => {
    const archived = shippedArchive.find((entry) => entry.id === order.id && entry.barcodePrinted);
    if (!archived) return order;
    return {
      ...order,
      barcodePrinted: true,
      barcodePrintedAt: archived.barcodePrintedAt ?? order.barcodePrintedAt ?? Date.now(),
    };
  });

  const assemblyItems = reconcileAssemblyChanges(prevOrders, nextOrders, memoryState.assemblyItems);

  memoryState = normalizeWorkspaceState({
    ...memoryState,
    orders: nextOrders,
    assemblyItems,
    shippedArchive,
    revision: memoryState.revision + 1,
    updatedAt: Date.now(),
    updatedBy: "archive-sync",
  });
  await saveSessionProgress(memoryState);
  broadcast(memoryState);
}

/** Обновить архив в оперативной сессии после записи на диск */
export function replaceSessionArchive(shippedArchive: ShippingOrder[]): Promise<void> {
  return enqueueWorkspaceUpdate(() => replaceSessionArchiveInner(shippedArchive));
}

/** Записать архив на диск и синхронизировать оперативную сессию */
export function persistAndReplaceArchive(incoming: ShippingOrder[]): Promise<ShippingOrder[]> {
  return enqueueWorkspaceUpdate(async () => {
    const archive = await mergePersistedArchive(incoming);
    await replaceSessionArchiveInner(archive);
    return archive;
  });
}

/** Свежие заказы с API + архив + сохранённый прогресс сборки/сканов */
async function replaceWorkspaceFromApiInner(fresh: WorkspaceData): Promise<SharedWorkspaceState> {
  let shippedArchive = memoryState?.shippedArchive ?? [];
  try {
    shippedArchive = await mergePersistedArchive(shippedArchive);
  } catch {
    // архив на диске недоступен — продолжаем с оперативным состоянием
  }
  const sessionProgress = await loadSessionProgress();

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

  await saveSessionProgress(next);
  memoryState = next;
  broadcast(next);
  return next;
}

export function replaceWorkspaceFromApi(fresh: WorkspaceData): Promise<SharedWorkspaceState> {
  return enqueueWorkspaceUpdate(() => replaceWorkspaceFromApiInner(fresh));
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

  const mergedBase = current
    ? mergeWorkspaces(current, incoming)
    : {
        version: 1 as const,
        assemblyItems: incoming.assemblyItems,
        orders: incoming.orders,
        shippedArchive: incoming.shippedArchive ?? [],
        apiOrderIds: incoming.apiOrderIds,
        updatedAt: incoming.updatedAt,
      };

  const next: SharedWorkspaceState = normalizeWorkspaceState({
    ...mergedBase,
    revision: (current?.revision ?? 0) + 1,
    updatedAt: Date.now(),
    updatedBy: clientId,
    resetToken: current?.resetToken,
  });

  next.shippedArchive = await mergePersistedArchive(next.shippedArchive ?? []);
  const activeIds = new Set(next.orders.map((order) => order.id));
  next.shippedArchive = next.shippedArchive.filter((order) => !activeIds.has(order.id));

  await saveSessionProgress(next);
  memoryState = next;
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
