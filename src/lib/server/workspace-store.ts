import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { newlyShippedOrders, reconcileAssemblyChanges, assemblyProgressPatchForShippedOrders } from "@/lib/assembly-demand";
import { mergeShippedArchives, normalizeWorkspaceState } from "@/lib/shipped-archive";
import { mergeWorkspaces } from "@/lib/workspace-merge";
import type { WorkspaceData } from "@/lib/build-workspace";
import { mergePersistedArchive, removePersistedArchiveOrders } from "@/lib/server/shipped-archive-store";
import {
  applySessionProgress,
  loadSessionProgress,
  saveSessionProgress,
} from "@/lib/server/session-progress-store";
import { mergeFreshOrdersData, mergeFreshOrdersDataForBrand } from "@/lib/workspace-api-merge";
import { logSync } from "@/lib/server/sync-log";
import { appendSyncEvent, forwardToRemote } from "@/lib/server/sync-store";
import { applyAssemblyProgressPatch, getAssemblyProgress } from "@/lib/server/assembly-progress-store";

type WorkspaceListener = (state: SharedWorkspaceState) => void;

const listeners = new Set<WorkspaceListener>();

let memoryState: SharedWorkspaceState | null = null;

function stripAssemblyCollected(items: AssemblyItem[]): AssemblyItem[] {
  return items.map((item) => ({
    ...item,
    collectedCount: 0,
    collectedAt: undefined,
  }));
}

function withoutAssemblyProgress(state: SharedWorkspaceState): SharedWorkspaceState {
  return {
    ...state,
    assemblyItems: stripAssemblyCollected(state.assemblyItems),
  };
}

async function consumeAssemblyProgressAfterShip(
  prev: SharedWorkspaceState | null,
  next: SharedWorkspaceState,
): Promise<void> {
  const shipped = newlyShippedOrders(
    prev?.orders ?? [],
    prev?.shippedArchive,
    next.orders,
    next.shippedArchive,
  );
  if (shipped.length === 0) return;

  const current = await getAssemblyProgress();
  const patch = assemblyProgressPatchForShippedOrders(current.items, shipped);
  if (Object.keys(patch).length === 0) return;
  await applyAssemblyProgressPatch(patch, "ship");
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
  memoryState = withoutAssemblyProgress(next);
  broadcast(memoryState);
  return memoryState;
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
  memoryState = withoutAssemblyProgress(state);
  broadcast(memoryState);
  return memoryState;
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

  const prev = memoryState;
  const prevOrders = prev.orders;
  const nextOrders = prevOrders.map((order) => {
    const archived = shippedArchive.find((entry) => entry.id === order.id && entry.barcodePrinted);
    if (!archived) return order;
    return {
      ...order,
      barcodePrinted: true,
      barcodePrintedAt: archived.barcodePrintedAt ?? order.barcodePrintedAt ?? Date.now(),
      shippedByUserId: archived.shippedByUserId ?? order.shippedByUserId,
      shippedByEmoji: archived.shippedByEmoji ?? order.shippedByEmoji,
    };
  });

  const assemblyItems = reconcileAssemblyChanges(prevOrders, nextOrders, prev.assemblyItems);

  memoryState = withoutAssemblyProgress(
    normalizeWorkspaceState({
      ...prev,
      orders: nextOrders,
      assemblyItems,
      shippedArchive,
      revision: prev.revision + 1,
      updatedAt: Date.now(),
      updatedBy: "archive-sync",
    }),
  );
  await consumeAssemblyProgressAfterShip(prev, memoryState);
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

/** Отмена отправки: убрать заказы из постоянного архива (диск + сессия) */
export function unshipOrdersFromArchive(orderIds: string[]): Promise<{
  removed: string[];
  archiveCount: number;
  revision: number;
}> {
  return enqueueWorkspaceUpdate(async () => {
    const ids = [...new Set(orderIds.filter(Boolean))];
    const archive = await removePersistedArchiveOrders(ids);
    if (memoryState) {
      const idSet = new Set(ids);
      const prev = memoryState;
      memoryState = withoutAssemblyProgress(
        normalizeWorkspaceState({
          ...prev,
          shippedArchive: (prev.shippedArchive ?? []).filter((order) => !idSet.has(order.id)),
          revision: prev.revision + 1,
          updatedAt: Date.now(),
          updatedBy: "archive-unship",
        }),
      );
      await saveSessionProgress(memoryState);
      broadcast(memoryState);
    }
    return {
      removed: ids,
      archiveCount: archive.length,
      revision: memoryState?.revision ?? 0,
    };
  });
}

/** Свежие заказы с API + архив + сохранённый прогресс сборки/сканов */
async function replaceWorkspaceFromApiInner(fresh: WorkspaceData): Promise<SharedWorkspaceState> {
  let shippedArchive = memoryState?.shippedArchive ?? [];
  // Заказы, которые в сессии снова active после отмены отправки, вычищаем из диска.
  const sessionLiveIds = (memoryState?.orders ?? [])
    .filter((order) => !order.barcodePrinted)
    .map((order) => order.id);
  if (sessionLiveIds.length > 0) {
    try {
      await removePersistedArchiveOrders(sessionLiveIds);
      const liveSet = new Set(sessionLiveIds);
      shippedArchive = shippedArchive.filter((order) => !liveSet.has(order.id));
    } catch {
      // диск недоступен — ниже merge всё равно попробуем
    }
  }
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
  const prev = memoryState;
  memoryState = withoutAssemblyProgress(next);
  await consumeAssemblyProgressAfterShip(prev, memoryState);
  broadcast(memoryState);
  return memoryState;
}

export function replaceWorkspaceFromApi(fresh: WorkspaceData): Promise<SharedWorkspaceState> {
  return enqueueWorkspaceUpdate(() => replaceWorkspaceFromApiInner(fresh));
}

async function replaceWorkspaceFromApiForBrandInner(
  brand: string,
  fresh: WorkspaceData,
): Promise<SharedWorkspaceState> {
  let shippedArchive = memoryState?.shippedArchive ?? [];
  const sessionLiveIds = (memoryState?.orders ?? [])
    .filter((order) => !order.barcodePrinted)
    .map((order) => order.id);
  if (sessionLiveIds.length > 0) {
    try {
      await removePersistedArchiveOrders(sessionLiveIds);
      const liveSet = new Set(sessionLiveIds);
      shippedArchive = shippedArchive.filter((order) => !liveSet.has(order.id));
    } catch {
      // ignore
    }
  }
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
    mergeFreshOrdersDataForBrand({ ...mergeBase, shippedArchive }, brand, fresh),
  );
  next = applySessionProgress(next, sessionProgress);
  next = {
    ...next,
    revision: (memoryState?.revision ?? 0) + 1,
    updatedAt: Date.now(),
    updatedBy: "api-sync",
  };

  await saveSessionProgress(next);
  const prev = memoryState;
  memoryState = withoutAssemblyProgress(next);
  await consumeAssemblyProgressAfterShip(prev, memoryState);
  broadcast(memoryState);
  return memoryState;
}

export function replaceWorkspaceFromApiForBrand(
  brand: string,
  fresh: WorkspaceData,
): Promise<SharedWorkspaceState> {
  return enqueueWorkspaceUpdate(() => replaceWorkspaceFromApiForBrandInner(brand, fresh));
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

  const activeIds = next.orders.map((order) => order.id);
  const activeIdSet = new Set(activeIds);
  const sessionArchive = (next.shippedArchive ?? []).filter((order) => !activeIdSet.has(order.id));
  // Отмена отправки: заказ снова active — вычистить из постоянного архива на диске,
  // иначе API refresh снова спрячет его и позиции не вернутся в сборку.
  if (activeIds.length > 0) {
    await removePersistedArchiveOrders(activeIds);
  }
  next.shippedArchive = await mergePersistedArchive(sessionArchive);
  next.shippedArchive = next.shippedArchive.filter((order) => !activeIdSet.has(order.id));

  await saveSessionProgress(next);
  memoryState = withoutAssemblyProgress(next);
  await consumeAssemblyProgressAfterShip(current, memoryState);
  broadcast(memoryState);

  void logSync("workspace.update", {
    revision: memoryState.revision,
    updatedBy: clientId,
    orders: memoryState.orders.length,
    assembly: memoryState.assemblyItems.length,
  });
  void appendSyncEvent(memoryState).then(() => forwardToRemote(memoryState!));

  return memoryState;
}

export function applyWorkspaceUpdate(
  incoming: SharedWorkspaceState | Omit<SharedWorkspaceState, "revision">,
  clientId: string,
): Promise<SharedWorkspaceState> {
  return enqueueWorkspaceUpdate(() => applyWorkspaceUpdateInner(incoming, clientId));
}
