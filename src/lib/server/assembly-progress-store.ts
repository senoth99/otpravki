import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type {
  AssemblyProgressEntry,
  AssemblyProgressState,
} from "@/types/assembly-progress";

export type { AssemblyProgressEntry, AssemblyProgressState };

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "assembly-progress.json");

let memory: AssemblyProgressState | null = null;
let writeChain = Promise.resolve();
let updateChain = Promise.resolve();

function emptyState(): AssemblyProgressState {
  return {
    revision: 0,
    updatedAt: Date.now(),
    updatedBy: "server",
    items: {},
  };
}

function broadcast(state: AssemblyProgressState) {
  const io =
    (global as { __workspaceIo?: { emit: (event: string, data: unknown) => void } }).__workspaceIo ??
    (globalThis as { __workspaceIo?: { emit: (event: string, data: unknown) => void } })
      .__workspaceIo;
  if (io) {
    io.emit("assembly:update", state);
  }
}

async function loadFromDisk(): Promise<AssemblyProgressState> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AssemblyProgressState>;
    return {
      revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : "server",
      items:
        parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)
          ? Object.fromEntries(
              Object.entries(parsed.items).filter(
                ([, v]) =>
                  v &&
                  typeof v === "object" &&
                  typeof (v as AssemblyProgressEntry).collectedCount === "number",
              ),
            )
          : {},
    };
  } catch {
    return emptyState();
  }
}

async function persist(state: AssemblyProgressState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(state), "utf8");
}

export async function getAssemblyProgress(): Promise<AssemblyProgressState> {
  if (!memory) {
    memory = await loadFromDisk();
  }
  return memory;
}

export async function applyAssemblyProgressPatch(
  patch: Record<string, AssemblyProgressEntry>,
  clientId: string,
): Promise<AssemblyProgressState> {
  const run = updateChain.then(async () => {
    const current = await getAssemblyProgress();
    const nextItems = { ...current.items };

    for (const [id, entry] of Object.entries(patch)) {
      if (!id || !entry || typeof entry.collectedCount !== "number") continue;
      const count = Math.max(0, Math.floor(entry.collectedCount));
      if (count <= 0) {
        delete nextItems[id];
        continue;
      }
      nextItems[id] = {
        collectedCount: count,
        collectedAt: entry.collectedAt,
      };
    }

    const next: AssemblyProgressState = {
      revision: current.revision + 1,
      updatedAt: Date.now(),
      updatedBy: clientId || "client",
      items: nextItems,
    };
    memory = next;
    broadcast(next);

    writeChain = writeChain
      .then(() => persist(next))
      .catch(() => {
        // disk write best-effort — HTTP не ждёт fsync
      });
    // Не блокируем POST на диск: состояние уже в RAM и ушло в socket.
    void writeChain;

    return next;
  });

  updateChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
