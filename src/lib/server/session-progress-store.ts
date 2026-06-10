import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PROGRESS_FILE = path.join(DATA_DIR, "workspace", "session-progress.json");

interface SessionProgress {
  version: 1;
  updatedAt: number;
  assembly: Record<string, { collectedCount: number; collectedAt?: number }>;
  scans: Record<string, Record<string, { scannedCount: number; scannedAt?: number }>>;
}

export function extractSessionProgress(state: SharedWorkspaceState): SessionProgress {
  const assembly: SessionProgress["assembly"] = {};
  for (const item of state.assemblyItems) {
    if (item.collectedCount > 0) {
      assembly[item.id] = {
        collectedCount: item.collectedCount,
        collectedAt: item.collectedAt,
      };
    }
  }

  const scans: SessionProgress["scans"] = {};
  for (const order of state.orders) {
    if (order.barcodePrinted) continue;
    const lines: Record<string, { scannedCount: number; scannedAt?: number }> = {};
    for (const line of order.items) {
      if (line.scannedCount > 0) {
        lines[line.id] = { scannedCount: line.scannedCount, scannedAt: line.scannedAt };
      }
    }
    if (Object.keys(lines).length > 0) {
      scans[order.id] = lines;
    }
  }

  return { version: 1, updatedAt: Date.now(), assembly, scans };
}

export function applySessionProgress(
  state: SharedWorkspaceState,
  progress: SessionProgress | null,
): SharedWorkspaceState {
  if (!progress) return state;

  const assemblyItems = state.assemblyItems.map((item) => {
    const saved = progress.assembly[item.id];
    if (!saved) return item;
    return {
      ...item,
      collectedCount: Math.min(saved.collectedCount, item.quantity),
      collectedAt: saved.collectedAt,
    };
  });

  const orders = state.orders.map((order) => {
    const savedLines = progress.scans[order.id];
    if (!savedLines) return order;
    return {
      ...order,
      items: order.items.map((line) => {
        const saved = savedLines[line.id];
        if (!saved) return line;
        return {
          ...line,
          scannedCount: Math.min(saved.scannedCount, line.quantity),
          scannedAt: saved.scannedAt,
        };
      }),
    };
  });

  return { ...state, assemblyItems, orders };
}

export async function loadSessionProgress(): Promise<SessionProgress | null> {
  try {
    const raw = await readFile(PROGRESS_FILE, "utf-8");
    return JSON.parse(raw) as SessionProgress;
  } catch {
    return null;
  }
}

export async function saveSessionProgress(state: SharedWorkspaceState): Promise<void> {
  const progress = extractSessionProgress(state);
  const hasData =
    Object.keys(progress.assembly).length > 0 || Object.keys(progress.scans).length > 0;

  if (!hasData) {
    try {
      const { unlink } = await import("fs/promises");
      await unlink(PROGRESS_FILE);
    } catch {
      // no file yet
    }
    return;
  }

  await mkdir(path.dirname(PROGRESS_FILE), { recursive: true });
  await writeFile(PROGRESS_FILE, JSON.stringify(progress), "utf-8");
}
