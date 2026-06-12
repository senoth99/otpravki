import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { FurnitureItem, WarehouseCell, WarehouseMapConfig } from "@/types/stock";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const MAP_PATH = path.join(DATA_DIR, "warehouse", "map.json");
const MAP_BACKUP_PATH = path.join(DATA_DIR, "warehouse", "map.legacy-backup.json");

const EMPTY_CONFIG: WarehouseMapConfig = { furniture: [], updatedAt: 0 };

interface LegacyCell {
  row?: number;
  col?: number;
  productSlug?: string;
  productName?: string;
  brand?: string;
  sizes?: string[];
  label?: string;
}

function isLegacyFormat(data: unknown): boolean {
  return Array.isArray((data as { cells?: unknown }).cells);
}

function migrateLegacyMap(data: { cells?: LegacyCell[] }): WarehouseMapConfig {
  const cells = data.cells ?? [];
  const furnitureCells: Record<string, WarehouseCell> = {};

  for (const cell of cells) {
    const row = cell.row ?? 1;
    const col = cell.col ?? 1;
    furnitureCells[`r${row}c${col}`] = {
      productSlug: cell.productSlug,
      productName: cell.productName,
      brand: cell.brand,
      sizes: cell.sizes,
      label: cell.label,
    };
  }

  const furniture: FurnitureItem[] = [
    {
      id: "legacy-rack-1",
      type: "rack",
      label: "Стеллаж (миграция)",
      x: 40,
      y: 40,
      rows: Math.max(1, ...cells.map((c) => c.row ?? 1)),
      cols: Math.max(1, ...cells.map((c) => c.col ?? 1)),
      cells: furnitureCells,
      rotation: "h",
    },
  ];

  return { furniture, updatedAt: Date.now() };
}

export async function getWarehouseMap(): Promise<WarehouseMapConfig> {
  try {
    const raw = await readFile(MAP_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (isLegacyFormat(parsed)) {
      try {
        await copyFile(MAP_PATH, MAP_BACKUP_PATH);
      } catch {
        // backup best-effort
      }
      const migrated = migrateLegacyMap(parsed as { cells?: LegacyCell[] });
      await saveWarehouseMap(migrated);
      return migrated;
    }
    const typed = parsed as WarehouseMapConfig;
    if (Array.isArray(typed.furniture)) {
      return {
        ...typed,
        furniture: typed.furniture.map((item) => ({
          ...item,
          cells: item.cells && typeof item.cells === "object" && !Array.isArray(item.cells) ? item.cells : {},
        })),
      };
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
