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
  const entry: SyncLogEntry = { at: new Date().toISOString(), type, ...data };
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readSyncLog(lines = 100): Promise<SyncLogEntry[]> {
  try {
    const raw = await readFile(LOG_FILE, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-lines)
      .map((line) => JSON.parse(line) as SyncLogEntry);
  } catch {
    return [];
  }
}

export function getSyncLogPath(): string {
  return LOG_FILE;
}
