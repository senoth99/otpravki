import { mergeOrder } from "@/lib/workspace-merge";
import type { ShippingOrder } from "@/types/shipping";
import type { WorkspaceState } from "@/types/workspace";

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
  const shippedArchive = mergeShippedArchives(state.shippedArchive ?? [], state.orders);
  const archiveIds = new Set(shippedArchive.map((order) => order.id));

  return {
    ...state,
    orders: state.orders.filter((order) => !archiveIds.has(order.id)),
    shippedArchive,
  };
}

/** Добавляет локальный архив к ответу сервера после «Обновить» */
export function mergeWorkspaceWithLocalArchive(
  remote: { orders: ShippingOrder[]; shippedArchive?: ShippingOrder[] },
  localOrders: ShippingOrder[],
  localArchive?: ShippingOrder[],
): { orders: ShippingOrder[]; shippedArchive: ShippingOrder[] } {
  const shippedArchive = mergeShippedArchives(
    remote.shippedArchive ?? [],
    remote.orders,
    localArchive ?? [],
    localOrders,
  );
  const archiveIds = new Set(shippedArchive.map((order) => order.id));
  const orders = remote.orders.filter((order) => !archiveIds.has(order.id));

  return { orders, shippedArchive };
}
