import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { AssemblyItem, ShippingOrder, ShippingOrderItem } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

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

/** Отправленный статус липкий: true держится, кроме явной отмены (barcodePrintedAt сброшен) */
function resolveBarcodePrinted(a: ShippingOrder, b: ShippingOrder): boolean {
  if (a.barcodePrinted && b.barcodePrinted) return true;
  if (!a.barcodePrinted && !b.barcodePrinted) return false;

  const unprinted = !a.barcodePrinted ? a : b;
  if (unprinted.barcodePrintedAt === undefined) return false;

  return true;
}

function mergeAssemblyItem(a: AssemblyItem, b: AssemblyItem): AssemblyItem {
  const aTime = a.collectedAt ?? 0;
  const bTime = b.collectedAt ?? 0;
  const winner = aTime >= bTime ? a : b;
  return {
    ...winner,
    quantity: Math.max(a.quantity, b.quantity),
    collectedCount:
      aTime === bTime ? Math.max(a.collectedCount, b.collectedCount) : winner.collectedCount,
    collectedAt: Math.max(aTime, bTime) || undefined,
  };
}

function mergeOrderItem(a: ShippingOrderItem, b: ShippingOrderItem): ShippingOrderItem {
  const aTime = a.scannedAt ?? 0;
  const bTime = b.scannedAt ?? 0;
  const winner = aTime >= bTime ? a : b;
  return {
    ...winner,
    scannedCount: aTime === bTime ? Math.max(a.scannedCount, b.scannedCount) : winner.scannedCount,
    scannedAt: Math.max(aTime, bTime) || undefined,
  };
}

export function mergeOrder(a: ShippingOrder, b: ShippingOrder): ShippingOrder {
  const itemsById = new Map<string, ShippingOrderItem>();
  for (const item of [...a.items, ...b.items]) {
    const existing = itemsById.get(item.id);
    itemsById.set(item.id, existing ? mergeOrderItem(existing, item) : item);
  }

  const barcodePrinted = resolveBarcodePrinted(a, b);
  const [base] = barcodePrinted
    ? (a.barcodePrinted ? [a, b] : [b, a])
    : (a.barcodePrintedAt ?? 0) >= (b.barcodePrintedAt ?? 0)
      ? [a, b]
      : [b, a];

  return {
    ...base,
    items: [...itemsById.values()],
    barcodePrinted,
    barcodePrintedAt: Math.max(a.barcodePrintedAt ?? 0, b.barcodePrintedAt ?? 0) || undefined,
  };
}

/** Сливает два снимка по времени последнего изменения каждой позиции */
export function mergeWorkspaces(
  a: SharedWorkspaceState,
  b: SharedWorkspaceState | Omit<SharedWorkspaceState, "revision">,
): SharedWorkspaceState {
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
    revision: Math.max(a.revision, "revision" in b ? b.revision : 0),
    updatedBy: newer.updatedBy ?? a.updatedBy ?? b.updatedBy,
    resetToken: newer.resetToken ?? a.resetToken ?? b.resetToken,
  };
}
