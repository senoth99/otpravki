import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { toGtin14 } from "@/lib/chestny-znak-gtin";
import { formatSize } from "@/lib/format";
import { getSharedWorkspace } from "@/lib/server/workspace-store";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const CATALOG_FILE = path.join(DATA_DIR, "chestny-znak", "gtin-catalog.json");

export interface GtinProductInfo {
  productName: string;
  size: string;
}

interface CatalogFile {
  version: 1;
  items: Record<string, GtinProductInfo>;
}

function mergeSize(left: string, right: string): string {
  const parts = new Set<string>();
  for (const raw of `${left},${right}`.split(",")) {
    const size = formatSize(raw);
    if (size) parts.add(size);
  }
  return [...parts].join(", ");
}

function mergeInfo(current: GtinProductInfo | undefined, next: GtinProductInfo): GtinProductInfo {
  if (!current) {
    return {
      productName: next.productName.trim(),
      size: formatSize(next.size),
    };
  }
  return {
    productName: next.productName.trim() || current.productName,
    size: mergeSize(current.size, next.size),
  };
}

async function readCatalogFile(): Promise<Record<string, GtinProductInfo>> {
  try {
    const raw = await readFile(CATALOG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as CatalogFile;
    if (!parsed.items || typeof parsed.items !== "object") return {};
    const items: Record<string, GtinProductInfo> = {};
    for (const [key, value] of Object.entries(parsed.items)) {
      const gtin = toGtin14(key);
      const productName = value?.productName?.trim() ?? "";
      if (!gtin || !productName) continue;
      items[gtin] = {
        productName,
        size: formatSize(value.size ?? ""),
      };
    }
    return items;
  } catch {
    return {};
  }
}

async function writeCatalogFile(items: Record<string, GtinProductInfo>): Promise<void> {
  await mkdir(path.dirname(CATALOG_FILE), { recursive: true });
  const tmp = `${CATALOG_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify({ version: 1, items }, null, 2), "utf-8");
  await rename(tmp, CATALOG_FILE);
}

function collectFromWorkspace(
  items: Record<string, GtinProductInfo>,
  orders: Array<{ items: Array<{ chestnyZnak?: string | null; productName: string; size: string }> }>,
): boolean {
  let changed = false;
  for (const order of orders) {
    for (const line of order.items) {
      const gtin = toGtin14(line.chestnyZnak ?? "");
      const productName = line.productName?.trim() ?? "";
      if (!gtin || !productName) continue;
      const next = mergeInfo(items[gtin], { productName, size: line.size });
      const prev = items[gtin];
      if (!prev || prev.productName !== next.productName || prev.size !== next.size) {
        items[gtin] = next;
        changed = true;
      }
    }
  }
  return changed;
}

export async function upsertGtinProduct(
  gtinRaw: string,
  info: { productName?: string; size?: string },
): Promise<void> {
  const gtin = toGtin14(gtinRaw);
  const productName = info.productName?.trim() ?? "";
  if (!gtin || !productName) return;
  const items = await readCatalogFile();
  items[gtin] = mergeInfo(items[gtin], { productName, size: info.size ?? "" });
  await writeCatalogFile(items);
}

export async function ingestGtinCatalogFromOrders(
  orders: Array<{ items: Array<{ chestnyZnak?: string | null; productName: string; size: string }> }>,
): Promise<void> {
  const items = await readCatalogFile();
  if (collectFromWorkspace(items, orders)) {
    await writeCatalogFile(items);
  }
}

export async function getGtinProductCatalog(): Promise<Record<string, GtinProductInfo>> {
  const items = await readCatalogFile();
  const workspace = await getSharedWorkspace().catch(() => null);
  const changed = workspace ? collectFromWorkspace(items, workspace.orders) : false;
  if (changed) {
    await writeCatalogFile(items).catch(() => undefined);
  }
  return items;
}
