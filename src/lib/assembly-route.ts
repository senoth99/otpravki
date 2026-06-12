import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import { findCellLocation, type WarehouseCellLocation } from "@/lib/warehouse-location";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { FurnitureItem, WarehouseMapConfig } from "@/types/stock";

const SLOT_W = 72;
const SLOT_H = 60;
const RACK_LABEL_H = 28;

/** Координата ячейки на карте склада (для построения маршрута). */
export function getCellWorldPosition(
  furniture: FurnitureItem,
  row: number,
  col: number,
): { x: number; y: number } {
  const isV = furniture.rotation === "v";
  const slotCount = Math.max(1, Number(furniture.cols) || 1);
  const pad = 8;
  const labelH = furniture.label?.trim() ? RACK_LABEL_H : 0;
  const colIdx = isV ? slotCount - col : col - 1;
  const rowIdx = Math.max(0, Math.min(furniture.rows - 1, furniture.rows - row));

  if (isV) {
    return {
      x: furniture.x + pad + colIdx * (SLOT_W + 4) + SLOT_W / 2,
      y: furniture.y + labelH + pad + rowIdx * (SLOT_H + 4) + SLOT_H / 2,
    };
  }

  return {
    x: furniture.x + pad + colIdx * (SLOT_W + 4) + SLOT_W / 2,
    y: furniture.y + labelH + pad + rowIdx * (SLOT_H + 4) + SLOT_H / 2,
  };
}

interface RoutedItem {
  item: AssemblyItem;
  x: number;
  y: number;
  location?: WarehouseCellLocation;
}

function nearestNeighborRoute(stops: RoutedItem[]): AssemblyItem[] {
  if (stops.length === 0) return [];

  const remaining = [...stops];
  const ordered: AssemblyItem[] = [];

  let cx = Math.min(...remaining.map((s) => s.x));
  let cy = Math.min(...remaining.map((s) => s.y));

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - cx;
      const dy = remaining[i].y - cy;
      const dist = Math.hypot(dx, dy);
      const score = dist + (remaining[i].location ? 0 : 10_000);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next.item);
    cx = next.x;
    cy = next.y;
  }

  return ordered;
}

/** Оптимальный порядок сборки: ближайший сосед по карте, без карты — по срочности. */
export function planAssemblyRoute(
  items: AssemblyItem[],
  orders: ShippingOrder[],
  map?: WarehouseMapConfig,
): AssemblyItem[] {
  const pending = items.filter((item) => item.collectedCount < item.quantity);
  if (pending.length === 0) return [];

  const located: RoutedItem[] = [];
  const unlocated: AssemblyItem[] = [];

  for (const item of pending) {
    const location = map ? findCellLocation(item, map) : undefined;
    if (!location || !map) {
      unlocated.push(item);
      continue;
    }

    const furniture = map.furniture.find((f) => f.id === location.furnitureId);
    if (!furniture) {
      unlocated.push(item);
      continue;
    }

    const local = getCellWorldPosition(furniture, location.row, location.col);
    located.push({
      item,
      x: local.x,
      y: local.y,
      location,
    });
  }

  const routed = nearestNeighborRoute(located);
  const fallback = sortAssemblyItemsByUrgency(unlocated, orders);
  return [...routed, ...fallback];
}
