import { mergeOrder } from "@/lib/workspace-merge";
import type { ShippingOrder } from "@/types/shipping";
import type { WorkspaceState } from "@/types/workspace";

/** Архив только растёт — уже отправленные не удаляются при API/sync */
export function unionPermanentArchive(...sources: ShippingOrder[][]): ShippingOrder[] {
  return mergeShippedArchives(...sources);
}

/** Объединяет архивы и заказы с barcodePrinted — старые записи не теряются */
export function mergeShippedArchives(...sources: ShippingOrder[][]): ShippingOrder[] {
  const byId = new Map<string, ShippingOrder>();

  for (const list of sources) {
    for (const order of list) {
      const prev = byId.get(order.id);
      byId.set(order.id, prev ? mergeOrder(prev, order) : order);
    }
  }

  return [...byId.values()]
    .filter((order) => order.barcodePrinted)
    .sort(
    (a, b) => (b.barcodePrintedAt ?? 0) - (a.barcodePrintedAt ?? 0),
  );
}

export function collectShippedArchive(
  orders: ShippingOrder[],
  shippedArchive?: ShippingOrder[],
): ShippingOrder[] {
  return mergeShippedArchives(shippedArchive ?? [], orders);
}

/** Активные заказы в orders, отправленные — только в shippedArchive */
export function normalizeWorkspaceState<T extends WorkspaceState>(state: T): T {
  const shippedArchive = unionPermanentArchive(state.shippedArchive ?? [], state.orders);
  const archiveIds = new Set(shippedArchive.map((order) => order.id));

  return {
    ...state,
    orders: state.orders.filter((order) => !archiveIds.has(order.id)),
    shippedArchive,
  };
}

/** Не даём фоновому sync затереть только что отправленный локально заказ */
export function preserveLocalShippedState<T extends WorkspaceState>(
  incoming: T,
  localOrders: ShippingOrder[],
  localArchive: ShippingOrder[],
): T {
  const localShipped = mergeShippedArchives(
    localArchive,
    localOrders.filter((order) => order.barcodePrinted),
  );
  if (localShipped.length === 0) return incoming;

  const shippedIds = new Set(localShipped.map((order) => order.id));
  return normalizeWorkspaceState({
    ...incoming,
    orders: incoming.orders.filter((order) => !shippedIds.has(order.id)),
    shippedArchive: mergeShippedArchives(incoming.shippedArchive ?? [], localShipped),
  });
}
