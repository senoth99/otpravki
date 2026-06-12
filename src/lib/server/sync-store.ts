import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const SYNC_DIR = path.join(DATA_DIR, "sync");
const LOG_FILE = path.join(SYNC_DIR, "events.jsonl");

export async function appendSyncEvent(payload: unknown) {
  await mkdir(SYNC_DIR, { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), payload }) + "\n";
  await appendFile(LOG_FILE, line, "utf-8");
}

export async function forwardToRemote(payload: unknown): Promise<boolean> {
  const url = process.env.SYNC_API_URL;
  if (!url) return false;

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/otpravki/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getSyncLogTail(lines = 20): Promise<string[]> {
  try {
    const raw = await readFile(LOG_FILE, "utf-8");
    if (!raw.trim()) return [];
    return raw.trim().split("\n").slice(-lines);
  } catch {
    return [];
  }
}
