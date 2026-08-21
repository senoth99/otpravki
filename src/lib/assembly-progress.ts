import { io, type Socket } from "socket.io-client";
import type { AssemblyItem } from "@/types/shipping";
import type {
  AssemblyProgressEntry,
  AssemblyProgressState,
} from "@/types/assembly-progress";
import { mutatingApiHeaders } from "@/lib/api-headers";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { getClientId } from "@/lib/workspace";

export type { AssemblyProgressEntry, AssemblyProgressState };

const SYNC_TIMEOUT_MS = 20_000;
let assemblySocket: Socket | null = null;

export function applyProgressToAssemblyItems(
  items: AssemblyItem[],
  progress: AssemblyProgressState | null | undefined,
): AssemblyItem[] {
  if (!progress?.items) {
    return items.map((item) => ({
      ...item,
      collectedCount: 0,
      collectedAt: undefined,
    }));
  }

  return items.map((item) => {
    const entry = progress.items[item.id];
    if (!entry || entry.collectedCount <= 0) {
      return { ...item, collectedCount: 0, collectedAt: undefined };
    }
    return {
      ...item,
      collectedCount: Math.min(entry.collectedCount, Math.max(0, item.quantity)),
      collectedAt: entry.collectedAt,
    };
  });
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
}): () => void {
  const apiSecret = process.env.NEXT_PUBLIC_OTPRAVKI_API_SECRET?.trim();
  const socket = io({
    path: "/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 300,
    reconnectionAttempts: Infinity,
    auth: apiSecret ? { secret: apiSecret } : undefined,
  });
  assemblySocket = socket;

  socket.on("connect", () => options.onConnectionChange?.(true));
  socket.on("disconnect", () => options.onConnectionChange?.(false));
  socket.on("assembly:sync", (progress: AssemblyProgressState) => {
    if (progress) options.onProgress(progress);
  });
  socket.on("assembly:update", (progress: AssemblyProgressState) => {
    if (progress) options.onProgress(progress);
  });

  return () => {
    socket.disconnect();
    if (assemblySocket === socket) assemblySocket = null;
    options.onConnectionChange?.(false);
  };
}
