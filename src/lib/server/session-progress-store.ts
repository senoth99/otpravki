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
  // Прогресс сборки не сохраняем — при обновлении всегда с нуля.
  const assembly: SessionProgress["assembly"] = {};

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

function normalizeSessionProgress(raw: unknown): SessionProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<SessionProgress>;
  if (data.version !== 1) return null;
  return {
    version: 1,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    assembly:
      data.assembly && typeof data.assembly === "object" && !Array.isArray(data.assembly)
        ? data.assembly
        : {},
    scans:
      data.scans && typeof data.scans === "object" && !Array.isArray(data.scans) ? data.scans : {},
  };
}

export function applySessionProgress(
  state: SharedWorkspaceState,
  progress: SessionProgress | null,
): SharedWorkspaceState {
  // Сборка всегда с нуля — collected не восстанавливаем.
  const assemblyItems = state.assemblyItems.map((item) => ({
    ...item,
    collectedCount: 0,
    collectedAt: undefined,
  }));

  if (!progress) {
    return { ...state, assemblyItems };
  }

  const scans = progress.scans ?? {};

  const orders = state.orders.map((order) => {
    const savedLines = scans[order.id];
    return {
      ...order,
      items: order.items.map((line) => {
        const saved = savedLines?.[line.id];
        if (!saved) {
          return { ...line, scannedCount: 0, scannedAt: undefined };
        }
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
    return normalizeSessionProgress(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveSessionProgress(state: SharedWorkspaceState): Promise<void> {
  const progress = extractSessionProgress(state);
  await mkdir(path.dirname(PROGRESS_FILE), { recursive: true });
  await writeFile(PROGRESS_FILE, JSON.stringify(progress), "utf-8");
}
