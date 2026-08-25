import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { FurnitureItem, WarehouseCell, WarehouseMapConfig } from "@/types/stock";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const MAP_PATH = path.join(DATA_DIR, "warehouse", "map.json");
const MAP_BACKUP_PATH = path.join(DATA_DIR, "warehouse", "map.legacy-backup.json");

const EMPTY_CONFIG: WarehouseMapConfig = { furniture: [], updatedAt: 0 };
const RACK_ROWS = 4;

let memory: WarehouseMapConfig | null = null;

function inferColsFromCells(cells: Record<string, WarehouseCell>): number {
  let maxCol = 1;
  for (const key of Object.keys(cells)) {
    const m = key.match(/^r\d+c(\d+)$/);
    if (m) maxCol = Math.max(maxCol, parseInt(m[1], 10));
  }
  return maxCol;
}

function normalizeRackItem(item: FurnitureItem): FurnitureItem {
  const rawCells =
    item.cells && typeof item.cells === "object" && !Array.isArray(item.cells) ? item.cells : {};
  const cells: Record<string, WarehouseCell> = {};
  for (const [key, cell] of Object.entries(rawCells)) {
    const m = key.match(/^r(\d+)c(\d+)$/);
    if (item.type === "rack" && m && parseInt(m[1], 10) > RACK_ROWS) continue;
    cells[key] = cell;
  }
  const cols = Math.max(1, Number(item.cols) || inferColsFromCells(cells));
  const rows = item.type === "rack" ? RACK_ROWS : Math.max(1, Number(item.rows) || RACK_ROWS);
  return {
    ...item,
    x: Number(item.x) || 0,
    y: Number(item.y) || 0,
    cols,
    rows,
    cells,
    rotation: item.rotation === "v" ? "v" : "h",
  };
}

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
  if (memory) return memory;
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
      memory = {
        ...typed,
        furniture: typed.furniture.map((item) =>
          normalizeRackItem({
            ...item,
            cells:
              item.cells && typeof item.cells === "object" && !Array.isArray(item.cells)
                ? item.cells
                : {},
          }),
        ),
      };
      return memory;
    }
    return { ...EMPTY_CONFIG };
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

export async function saveWarehouseMap(config: WarehouseMapConfig): Promise<void> {
  const normalized: WarehouseMapConfig = {
    ...config,
    furniture: config.furniture.map((item) => normalizeRackItem(item)),
  };
  await mkdir(path.dirname(MAP_PATH), { recursive: true });
  await writeFile(MAP_PATH, JSON.stringify(normalized, null, 2), "utf-8");
  memory = normalized;
}
