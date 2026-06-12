import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const LOG_FILE = path.join(DATA_DIR, "sync", "events.jsonl");

export type SyncLogEntry = {
  at: string;
  type: string;
  [key: string]: unknown;
};

export async function logSync(type: string, data: Record<string, unknown> = {}) {
  try {
    const entry: SyncLogEntry = { at: new Date().toISOString(), type, ...data };
    await mkdir(path.dirname(LOG_FILE), { recursive: true });
    await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // logging must not break sync
  }
}

export async function readSyncLog(lines = 100): Promise<SyncLogEntry[]> {
  try {
    const raw = await readFile(LOG_FILE, "utf8");
    const parsed: SyncLogEntry[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        parsed.push(JSON.parse(trimmed) as SyncLogEntry);
      } catch {
        // skip corrupt line
      }
    }
    return parsed.slice(-lines);
  } catch {
    return [];
  }
}

export function getSyncLogPath(): string {
  return LOG_FILE;
}
