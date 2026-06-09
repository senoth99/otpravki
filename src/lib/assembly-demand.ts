import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

export function assemblyItemKey(productId: string, sizeId: number): string {
  return `${productId}-${sizeId}`;
}

/** Сколько ещё нужно собрать по каждой позиции (только неотправленные заказы) */
export function computeAssemblyDemand(orders: ShippingOrder[]): Map<string, number> {
  const demand = new Map<string, number>();

  for (const order of orders) {
    if (order.barcodePrinted) continue;
    for (const item of order.items) {
      const key = assemblyItemKey(item.productId, item.sizeId);
      demand.set(key, (demand.get(key) ?? 0) + item.quantity);
    }
  }

  return demand;
}

/** Позиции, которые ещё нужно собрать перед отправкой */
export function getPendingAssemblyItems(
  items: AssemblyItem[],
  orders: ShippingOrder[],
): AssemblyItem[] {
  const activeOrders = orders.filter((order) => !order.barcodePrinted);
  const demand = computeAssemblyDemand(activeOrders);

  const pending = items
    .map((item) => {
      const key = assemblyItemKey(item.productId, item.sizeId);
      const needed = demand.get(key) ?? 0;
      if (needed === 0 || item.collectedCount >= needed) return null;
      return { ...item, quantity: needed };
    })
    .filter((item): item is AssemblyItem => item !== null);

  return sortAssemblyItemsByUrgency(pending, activeOrders);
}

/** Списывает собранные единицы после отправки заказа */
export function consumeAssemblyForOrder(
  assemblyItems: AssemblyItem[],
  order: ShippingOrder,
): AssemblyItem[] {
  return assemblyItems.map((assemblyItem) => {
    const key = assemblyItemKey(assemblyItem.productId, assemblyItem.sizeId);
    const line = order.items.find(
      (item) => assemblyItemKey(item.productId, item.sizeId) === key,
    );
    if (!line) return assemblyItem;

    const nextCount = Math.max(0, assemblyItem.collectedCount - line.quantity);
    if (nextCount === assemblyItem.collectedCount) return assemblyItem;

    return {
      ...assemblyItem,
      collectedCount: nextCount,
      collectedAt: Date.now(),
    };
  });
}

export function reconcileAssemblyOnShip(
  prevOrders: ShippingOrder[],
  nextOrders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): AssemblyItem[] {
  const prevShipped = new Set(prevOrders.filter((order) => order.barcodePrinted).map((order) => order.id));
  let items = assemblyItems;

  for (const order of nextOrders) {
    if (order.barcodePrinted && !prevShipped.has(order.id)) {
      items = consumeAssemblyForOrder(items, order);
    }
  }

  return items;
}
