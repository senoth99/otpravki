import type { ShippingOrder } from "@/types/shipping";

/** Объединяет архивы и заказы с barcodePrinted — старые записи не теряются */
export function mergeShippedArchives(...sources: ShippingOrder[][]): ShippingOrder[] {
  const byId = new Map<string, ShippingOrder>();

  for (const list of sources) {
    for (const order of list) {
      if (!order.barcodePrinted) continue;
      const prev = byId.get(order.id);
      if (!prev || (order.barcodePrintedAt ?? 0) >= (prev.barcodePrintedAt ?? 0)) {
        byId.set(order.id, order);
      }
    }
  }

  return [...byId.values()].sort(
    (a, b) => (b.barcodePrintedAt ?? 0) - (a.barcodePrintedAt ?? 0),
  );
}

export function collectShippedArchive(
  orders: ShippingOrder[],
  shippedArchive?: ShippingOrder[],
): ShippingOrder[] {
  return mergeShippedArchives(shippedArchive ?? [], orders);
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

  const active = remote.orders.filter((order) => !archiveIds.has(order.id));
  const orders = [...active, ...shippedArchive];

  return { orders, shippedArchive };
}
