import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";
import { mergeWorkspaces } from "@/lib/workspace-merge";
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

export async function initSharedWorkspace(
  assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
): Promise<SharedWorkspaceState> {
  const existing = await getSharedWorkspace();
  if (existing) return existing;

  const state: SharedWorkspaceState = {
    version: 1,
    revision: 1,
    assemblyItems,
    orders,
    updatedAt: Date.now(),
    updatedBy: "server",
  };

  memoryState = state;
  await writeToDisk(state);
  return state;
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
