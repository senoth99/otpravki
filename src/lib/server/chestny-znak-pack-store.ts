import { appendFile, mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const CZ_DIR = path.join(DATA_DIR, "chestny-znak");
const PACK_EVENTS_FILE = path.join(CZ_DIR, "pack-events.jsonl");
const CLAIMED_FILE = path.join(CZ_DIR, "claimed-cis.json");
const CLAIM_TTL_MS = 30 * 60 * 1000;

let packLock: Promise<unknown> = Promise.resolve();

export function withPackLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = packLock.then(fn, fn);
  packLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export interface PackEvent {
  ts: number;
  ok: boolean;
  gtin: string;
  cis?: string;
  productId?: string;
  productName?: string;
  orderId?: string;
  itemId?: string;
  error?: string;
  docId?: string;
}

async function ensureDir(): Promise<void> {
  await mkdir(CZ_DIR, { recursive: true });
}

export async function appendPackEvent(event: PackEvent): Promise<void> {
  await ensureDir();
  await appendFile(PACK_EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf-8");
}

export async function loadPackEvents(): Promise<PackEvent[]> {
  try {
    const raw = await readFile(PACK_EVENTS_FILE, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as PackEvent;
        } catch {
          return null;
        }
      })
      .filter((row): row is PackEvent => Boolean(row));
  } catch {
    return [];
  }
}

interface ClaimedFile {
  version: 1;
  items: Array<{ cis: string; ts: number }>;
}

async function readClaimedFile(): Promise<ClaimedFile> {
  try {
    const raw = await readFile(CLAIMED_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ClaimedFile;
    if (!Array.isArray(parsed.items)) return { version: 1, items: [] };
    return { version: 1, items: parsed.items };
  } catch {
    return { version: 1, items: [] };
  }
}

async function writeClaimedFile(file: ClaimedFile): Promise<void> {
  await ensureDir();
  const tmp = `${CLAIMED_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(file), "utf-8");
  await rename(tmp, CLAIMED_FILE);
}

function freshClaims(file: ClaimedFile, now = Date.now()): ClaimedFile["items"] {
  return file.items.filter((row) => now - row.ts <= CLAIM_TTL_MS);
}

export async function listUsedCis(): Promise<Set<string>> {
  const [events, claimed] = await Promise.all([loadPackEvents(), readClaimedFile()]);
  const used = new Set<string>();
  for (const event of events) {
    if (event.ok && event.cis) used.add(event.cis);
  }
  for (const row of freshClaims(claimed)) {
    used.add(row.cis);
  }
  return used;
}

export async function claimCis(cis: string): Promise<boolean> {
  const used = await listUsedCis();
  if (used.has(cis)) return false;
  const file = await readClaimedFile();
  const items = freshClaims(file);
  if (items.some((row) => row.cis === cis)) return false;
  items.push({ cis, ts: Date.now() });
  await writeClaimedFile({ version: 1, items });
  return true;
}

export async function releaseCis(cis: string): Promise<void> {
  const file = await readClaimedFile();
  await writeClaimedFile({
    version: 1,
    items: freshClaims(file).filter((row) => row.cis !== cis),
  });
}
