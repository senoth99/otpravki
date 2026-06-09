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

function enrichAssemblyItems(items: AssemblyItem[], orders: ShippingOrder[]): AssemblyItem[] {
  const activeOrders = orders.filter((order) => !order.barcodePrinted);
  const demand = computeAssemblyDemand(activeOrders);

  return items
    .map((item) => {
      const key = assemblyItemKey(item.productId, item.sizeId);
      const needed = demand.get(key) ?? 0;
      if (needed === 0) return null;
      return { ...item, quantity: needed };
    })
    .filter((item): item is AssemblyItem => item !== null);
}

export interface AssemblyViewSections {
  pending: AssemblyItem[];
  completed: AssemblyItem[];
}

export function computeCompletedAssemblyIds(
  items: AssemblyItem[],
  orders: ShippingOrder[],
): string[] {
  return enrichAssemblyItems(items, orders)
    .filter((item) => item.collectedCount >= item.quantity)
    .map((item) => item.id);
}

/**
 * settled=false — все позиции в одном списке (собранные остаются на месте).
 * settled=true — несобранные сверху, собранные снизу.
 * pinnedCompletedIds — секции не пересчитываются при +/- до следующего входа на вкладку.
 */
export function getAssemblyViewSections(
  items: AssemblyItem[],
  orders: ShippingOrder[],
  settled: boolean,
  pinnedCompletedIds?: ReadonlySet<string>,
): AssemblyViewSections {
  const activeOrders = orders.filter((order) => !order.barcodePrinted);
  const enriched = enrichAssemblyItems(items, orders);

  if (!settled) {
    return {
      pending: sortAssemblyItemsByUrgency(enriched, activeOrders),
      completed: [],
    };
  }

  if (pinnedCompletedIds) {
    const completed = enriched.filter((item) => pinnedCompletedIds.has(item.id));
    const pending = enriched.filter((item) => !pinnedCompletedIds.has(item.id));

    return {
      pending: sortAssemblyItemsByUrgency(pending, activeOrders),
      completed: sortAssemblyItemsByUrgency(completed, activeOrders),
    };
  }

  const pending = enriched.filter((item) => item.collectedCount < item.quantity);
  const completed = enriched.filter((item) => item.collectedCount >= item.quantity);

  return {
    pending: sortAssemblyItemsByUrgency(pending, activeOrders),
    completed: sortAssemblyItemsByUrgency(completed, activeOrders),
  };
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
