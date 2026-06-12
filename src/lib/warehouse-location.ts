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

export function findCellLocation(
  item: AssemblyItem,
  map: WarehouseMapConfig,
): WarehouseCellLocation | undefined {
  for (const furniture of map.furniture) {
    for (const [key, cell] of Object.entries(furniture.cells)) {
      if (
        cell.productSlug === item.productId &&
        cell.sizes?.some((s) => s.toLowerCase() === item.size.toLowerCase())
      ) {
        const match = key.match(/^r(\d+)c(\d+)$/);
        if (match) {
          const row = parseInt(match[1], 10);
          const col = parseInt(match[2], 10);
          return {
            furnitureId: furniture.id,
            furnitureLabel: furniture.label,
            cellKey: key,
            row,
            col,
            hint: formatCellLocationHint(furniture.label, row, col),
          };
        }
      }
    }
  }
  return undefined;
}
