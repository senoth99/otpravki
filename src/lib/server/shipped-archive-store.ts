import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { ShippingOrder } from "@/types/shipping";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const ARCHIVE_DIR = path.join(DATA_DIR, "workspace");
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, "shipped-archive.json");
const ARCHIVE_MAX = Number(process.env.SHIPPED_ARCHIVE_MAX ?? 200);

interface ArchiveFile {
  version: 1;
  updatedAt: number;
  orders: ShippingOrder[];
}

export function capShippedArchive(orders: ShippingOrder[]): ShippingOrder[] {
  return mergeShippedArchives(orders).slice(0, ARCHIVE_MAX);
}

export async function loadPersistedArchive(): Promise<ShippingOrder[]> {
  try {
    const raw = await readFile(ARCHIVE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ArchiveFile;
    if (!Array.isArray(parsed.orders)) return [];
    return capShippedArchive(parsed.orders);
  } catch {
    return [];
  }
}

export async function savePersistedArchive(orders: ShippingOrder[]): Promise<ShippingOrder[]> {
  const capped = capShippedArchive(orders);
  const payload: ArchiveFile = {
    version: 1,
    updatedAt: Date.now(),
    orders: capped,
  };
  await mkdir(ARCHIVE_DIR, { recursive: true });
  await writeFile(ARCHIVE_FILE, JSON.stringify(payload), "utf-8");
  return capped;
}

export async function mergePersistedArchive(...sources: ShippingOrder[][]): Promise<ShippingOrder[]> {
  const persisted = await loadPersistedArchive();
  return savePersistedArchive(mergeShippedArchives(persisted, ...sources));
}
