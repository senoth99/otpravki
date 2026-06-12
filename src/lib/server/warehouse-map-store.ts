import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { WarehouseMapConfig } from "@/types/stock";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const MAP_PATH = path.join(DATA_DIR, "warehouse", "map.json");

const EMPTY_CONFIG: WarehouseMapConfig = { cells: [], updatedAt: 0 };

export async function getWarehouseMap(): Promise<WarehouseMapConfig> {
  try {
    const raw = await readFile(MAP_PATH, "utf-8");
    return JSON.parse(raw) as WarehouseMapConfig;
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

export async function saveWarehouseMap(config: WarehouseMapConfig): Promise<void> {
  await mkdir(path.dirname(MAP_PATH), { recursive: true });
  await writeFile(MAP_PATH, JSON.stringify(config, null, 2), "utf-8");
}
