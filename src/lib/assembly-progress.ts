import type { AssemblyItem } from "@/types/shipping";
import type {
  AssemblyProgressEntry,
  AssemblyProgressState,
} from "@/types/assembly-progress";
import { mutatingApiHeaders } from "@/lib/api-headers";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { acquireRealtimeSocket, releaseRealtimeSocket } from "@/lib/realtime-socket";
import { getClientId } from "@/lib/workspace";

export type { AssemblyProgressEntry, AssemblyProgressState };

const SYNC_TIMEOUT_MS = 20_000;

function withCollected(
  item: AssemblyItem,
  collectedCount: number,
  collectedAt?: number,
): AssemblyItem {
  if (item.collectedCount === collectedCount && item.collectedAt === collectedAt) return item;
  return { ...item, collectedCount, collectedAt };
}

export function applyProgressToAssemblyItems(
  items: AssemblyItem[],
  progress: AssemblyProgressState | null | undefined,
): AssemblyItem[] {
  return applyProgressToItems(items, progress);
}

export function applyProgressToItem(
  item: AssemblyItem,
  progress: AssemblyProgressState | null | undefined,
): AssemblyItem {
  const entry = progress?.items?.[item.id];
  if (!entry || entry.collectedCount <= 0) {
    return withCollected(item, 0, undefined);
  }
  return withCollected(
    item,
    Math.max(0, Math.floor(entry.collectedCount)),
    entry.collectedAt,
  );
}

export function applyProgressToItems(
  items: AssemblyItem[],
  progress: AssemblyProgressState | null | undefined,
): AssemblyItem[] {
  if (!progress?.items) {
    if (items.every((item) => item.collectedCount === 0 && item.collectedAt === undefined)) {
      return items;
    }
    return items.map((item) => withCollected(item, 0, undefined));
  }
  return items.map((item) => applyProgressToItem(item, progress));
}

/** Убрать прогресс по позициям, которых больше нет в очереди сборки (после отгрузки). */
export function staleAssemblyProgressPatch(
  items: AssemblyItem[],
  progress: AssemblyProgressState | null | undefined,
): Array<{ id: string; collectedCount: number; collectedAt?: number }> {
  if (!progress?.items) return [];
  const live = new Map(items.map((item) => [item.id, item]));
  const patch: Array<{ id: string; collectedCount: number; collectedAt?: number }> = [];

  for (const [id, entry] of Object.entries(progress.items)) {
    const item = live.get(id);
    if (!item || item.quantity <= 0) {
      if (entry.collectedCount > 0) patch.push({ id, collectedCount: 0 });
      continue;
    }
  }

  return patch;
}

export async function fetchAssemblyProgress(): Promise<AssemblyProgressState | null> {
  try {
    const res = await fetchWithTimeout("/api/assembly/progress", {
      cache: "no-store",
      timeoutMs: SYNC_TIMEOUT_MS,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; progress?: AssemblyProgressState };
    return data.progress ?? null;
  } catch {
    return null;
  }
}

export async function pushAssemblyProgress(
  items: Array<{ id: string; collectedCount: number; collectedAt?: number }>,
): Promise<AssemblyProgressState | null> {
  if (items.length === 0) return null;
  try {
    const res = await fetchWithTimeout("/api/assembly/progress", {
      method: "POST",
      headers: mutatingApiHeaders(),
      body: JSON.stringify({
        clientId: getClientId(),
        items,
      }),
      cache: "no-store",
      timeoutMs: SYNC_TIMEOUT_MS,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; progress?: AssemblyProgressState };
    return data.progress ?? null;
  } catch {
    return null;
  }
}

export function subscribeAssemblyProgress(options: {
  onProgress: (progress: AssemblyProgressState) => void;
  onConnectionChange?: (connected: boolean) => void;
  query?: Record<string, string>;
}): () => void {
  const socket = acquireRealtimeSocket(options.query);

  const onConnect = () => options.onConnectionChange?.(true);
  const onDisconnect = () => options.onConnectionChange?.(false);
  const onSync = (progress: AssemblyProgressState) => {
    if (progress) options.onProgress(progress);
  };
  const onUpdate = (progress: AssemblyProgressState) => {
    if (progress) options.onProgress(progress);
  };

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("assembly:sync", onSync);
  socket.on("assembly:update", onUpdate);
  if (socket.connected) onConnect();

  return () => {
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("assembly:sync", onSync);
    socket.off("assembly:update", onUpdate);
    releaseRealtimeSocket();
    options.onConnectionChange?.(false);
  };
}
