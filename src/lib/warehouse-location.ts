import type { AssemblyItem } from "@/types/shipping";
import type { WarehouseMapConfig } from "@/types/stock";

export interface WarehouseCellLocation {
  furnitureId: string;
  furnitureLabel: string;
  cellKey: string;
  row: number;
  col: number;
  hint: string;
}

export function formatCellLocationHint(label: string, row: number, col: number): string {
  return `${label} Р${row}Я${col}`;
}

export function locationKey(location: Pick<WarehouseCellLocation, "furnitureId" | "cellKey">): string {
  return `${location.furnitureId}:${location.cellKey}`;
}

export function cellLocationLookupKey(productId: string, size: string): string {
  return `${productId}::${size.trim().toLowerCase()}`;
}

export function buildCellLocationIndex(
  map: WarehouseMapConfig,
): Map<string, WarehouseCellLocation> {
  const index = new Map<string, WarehouseCellLocation>();
  for (const furniture of map.furniture) {
    const cells = furniture.cells ?? {};
    for (const [key, cell] of Object.entries(cells)) {
      if (!cell.productSlug || !cell.sizes?.length) continue;
      const match = key.match(/^r(\d+)c(\d+)$/);
      if (!match) continue;
      const row = parseInt(match[1], 10);
      const col = parseInt(match[2], 10);
      const loc: WarehouseCellLocation = {
        furnitureId: furniture.id,
        furnitureLabel: furniture.label,
        cellKey: key,
        row,
        col,
        hint: formatCellLocationHint(furniture.label, row, col),
      };
      for (const size of cell.sizes) {
        const lookup = cellLocationLookupKey(cell.productSlug, size);
        if (!index.has(lookup)) index.set(lookup, loc);
      }
    }
  }
  return index;
}

export function findCellLocationInIndex(
  item: AssemblyItem,
  index: Map<string, WarehouseCellLocation>,
): WarehouseCellLocation | undefined {
  return index.get(cellLocationLookupKey(item.productId, item.size));
}

export function findCellLocation(
  item: AssemblyItem,
  map: WarehouseMapConfig,
): WarehouseCellLocation | undefined {
  return findCellLocationInIndex(item, buildCellLocationIndex(map));
}
