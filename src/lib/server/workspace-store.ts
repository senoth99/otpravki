import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { mergeFreshOrdersData } from "@/lib/workspace-api-merge";
import { mergeWorkspaces } from "@/lib/workspace-merge";
import type { WorkspaceData } from "@/lib/build-workspace";
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
    listener(state);
  }
}

export function subscribeWorkspace(listener: WorkspaceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getSharedWorkspace(): Promise<SharedWorkspaceState | null> {
  if (memoryState) return memoryState;
  memoryState = await readFromDisk();
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

  const next: SharedWorkspaceState = existing
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
        apiOrderIds: fresh.orders.map((order) => order.id),
        updatedAt: Date.now(),
        updatedBy: "server",
      };

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

export async function applyWorkspaceUpdate(
  incoming: SharedWorkspaceState | Omit<SharedWorkspaceState, "revision">,
  clientId: string,
): Promise<SharedWorkspaceState> {
  const current = await getSharedWorkspace();

  const mergedBase = current
    ? mergeWorkspaces(current, incoming)
    : {
        version: 1 as const,
        assemblyItems: incoming.assemblyItems,
        orders: incoming.orders,
        updatedAt: incoming.updatedAt,
      };

  const next: SharedWorkspaceState = {
    ...mergedBase,
    revision: (current?.revision ?? 0) + 1,
    updatedAt: Date.now(),
    updatedBy: clientId,
  };

  memoryState = next;
  await writeToDisk(next);
  broadcast(next);

  void appendSyncEvent(next).then(() => forwardToRemote(next));

  return next;
}
