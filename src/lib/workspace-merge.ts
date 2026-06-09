import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { AssemblyItem, ShippingOrder, ShippingOrderItem } from "@/types/shipping";
import type { WorkspaceState } from "@/types/workspace";

function pickByTimestamp<T extends number>(
  aValue: T,
  aAt: number | undefined,
  bValue: T,
  bAt: number | undefined,
): T {
  const aTime = aAt ?? 0;
  const bTime = bAt ?? 0;
  if (aTime === bTime) return Math.max(aValue, bValue) as T;
  return aTime > bTime ? aValue : bValue;
}

function mergeAssemblyItem(a: AssemblyItem, b: AssemblyItem): AssemblyItem {
  const [first] = (a.collectedAt ?? 0) >= (b.collectedAt ?? 0) ? [a, b] : [b, a];
  return {
    ...first,
    collectedCount: Math.max(a.collectedCount, b.collectedCount),
    collectedAt: Math.max(a.collectedAt ?? 0, b.collectedAt ?? 0) || undefined,
  };
}

function mergeOrderItem(a: ShippingOrderItem, b: ShippingOrderItem): ShippingOrderItem {
  const [first] = (a.scannedAt ?? 0) >= (b.scannedAt ?? 0) ? [a, b] : [b, a];
  return {
    ...first,
    scannedCount: Math.max(a.scannedCount, b.scannedCount),
    scannedAt: Math.max(a.scannedAt ?? 0, b.scannedAt ?? 0) || undefined,
  };
}

function mergeOrder(a: ShippingOrder, b: ShippingOrder): ShippingOrder {
  const itemsById = new Map<string, ShippingOrderItem>();
  for (const item of [...a.items, ...b.items]) {
    const existing = itemsById.get(item.id);
    itemsById.set(item.id, existing ? mergeOrderItem(existing, item) : item);
  }

  const aPrinted = a.barcodePrinted;
  const bPrinted = b.barcodePrinted;
  const barcodePrinted = pickByTimestamp(
    aPrinted ? 1 : 0,
    a.barcodePrintedAt,
    bPrinted ? 1 : 0,
    b.barcodePrintedAt,
  ) === 1;

  const [base] = (a.barcodePrintedAt ?? 0) >= (b.barcodePrintedAt ?? 0) ? [a, b] : [b, a];

  return {
    ...base,
    items: [...itemsById.values()],
    barcodePrinted,
    barcodePrintedAt: Math.max(a.barcodePrintedAt ?? 0, b.barcodePrintedAt ?? 0) || undefined,
  };
}

/** Сливает два снимка по времени последнего изменения каждой позиции */
export function mergeWorkspaces(a: WorkspaceState, b: WorkspaceState): WorkspaceState {
  const assemblyById = new Map<string, AssemblyItem>();
  for (const item of [...a.assemblyItems, ...b.assemblyItems]) {
    const existing = assemblyById.get(item.id);
    assemblyById.set(item.id, existing ? mergeAssemblyItem(existing, item) : item);
  }

  const orderById = new Map<string, ShippingOrder>();
  for (const order of [...a.orders, ...b.orders]) {
    const existing = orderById.get(order.id);
    orderById.set(order.id, existing ? mergeOrder(existing, order) : order);
  }

  const newer = a.updatedAt >= b.updatedAt ? a : b;

  return {
    version: 1,
    assemblyItems: [...assemblyById.values()],
    orders: [...orderById.values()],
    shippedArchive: mergeShippedArchives(a.shippedArchive ?? [], a.orders, b.shippedArchive ?? [], b.orders),
    apiOrderIds: newer.apiOrderIds ?? a.apiOrderIds ?? b.apiOrderIds,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
