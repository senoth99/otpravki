import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { WarehouseMapConfig } from "@/types/stock";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const MAP_PATH = path.join(DATA_DIR, "warehouse", "map.json");

const EMPTY_CONFIG: WarehouseMapConfig = { furniture: [], updatedAt: 0 };

function isLegacyFormat(data: unknown): boolean {
  return Array.isArray((data as { cells?: unknown }).cells);
}

export async function getWarehouseMap(): Promise<WarehouseMapConfig> {
  try {
    const raw = await readFile(MAP_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (isLegacyFormat(parsed)) {
      return { ...EMPTY_CONFIG };
    }
    const typed = parsed as WarehouseMapConfig;
    if (Array.isArray(typed.furniture)) {
      return typed;
    }
    return { ...EMPTY_CONFIG };
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

export async function saveWarehouseMap(config: WarehouseMapConfig): Promise<void> {
  await mkdir(path.dirname(MAP_PATH), { recursive: true });
  await writeFile(MAP_PATH, JSON.stringify(config, null, 2), "utf-8");
}
