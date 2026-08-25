import { assemblyItemKey } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import { formatSize } from "@/lib/format";
import { resolveOrderUrgency, URGENCY_WEIGHT } from "@/lib/urgency";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

export interface MissingAssemblyItem {
  productId: string;
  sizeId: number;
  productName: string;
  size: string;
  need: number;
  have: number;
}

export interface AssemblyAllocation {
  readyByOrderId: Map<string, boolean>;
  missingByOrderId: Map<string, MissingAssemblyItem[]>;
}

/**
 * Готовность к отправке по пулу единиц на позициях сборки.
 * `unitsOf` — quantity (склад/спрос) или collectedCount (кнопка «Собрано»).
 */
function buildAllocationFromUnits(
  orders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
  unitsOf: (item: AssemblyItem) => number,
): AssemblyAllocation {
  const pool = new Map<string, number>();
  for (const item of assemblyItems) {
    const key = assemblyItemKey(item.productId, item.sizeId, item.isBlogger === true);
    pool.set(key, (pool.get(key) ?? 0) + Math.max(0, unitsOf(item)));
  }

  const readyByOrderId = new Map<string, boolean>();
  const missingByOrderId = new Map<string, MissingAssemblyItem[]>();

  const activeOrders = orders
    .filter((order) => !order.barcodePrinted)
    .sort((a, b) => {
      const urgencyDiff =
        URGENCY_WEIGHT[resolveOrderUrgency(a)] - URGENCY_WEIGHT[resolveOrderUrgency(b)];
      if (urgencyDiff !== 0) return urgencyDiff;
      return a.orderNumber.localeCompare(b.orderNumber, "ru");
    });

  for (const order of activeOrders) {
    const missing: MissingAssemblyItem[] = [];
    let ready = true;
    const isBlogger = orderIsBlogger(order);

    for (const line of order.items) {
      const key = assemblyItemKey(line.productId, line.sizeId, isBlogger);
      const have = pool.get(key) ?? 0;
      const need = line.quantity;

      if (have < need) {
        ready = false;
        missing.push({
          productId: line.productId,
          sizeId: line.sizeId,
          productName: line.productName,
          size: formatSize(line.size),
          need,
          have,
        });
      }
    }

    if (ready) {
      for (const line of order.items) {
        const key = assemblyItemKey(line.productId, line.sizeId, isBlogger);
        pool.set(key, (pool.get(key) ?? 0) - line.quantity);
      }
    }

    readyByOrderId.set(order.id, ready);
    missingByOrderId.set(order.id, missing);
  }

  for (const order of orders) {
    if (order.barcodePrinted) {
      readyByOrderId.set(order.id, false);
      missingByOrderId.set(order.id, []);
    }
  }

  return { readyByOrderId, missingByOrderId };
}

/**
 * Готовность к отправке по наличию в пуле сборки (quantity из API),
 * без учёта кнопки «Собрано» (collectedCount).
 */
export function buildAssemblyAllocation(
  orders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): AssemblyAllocation {
  return buildAllocationFromUnits(orders, assemblyItems, (item) => item.quantity);
}

/** Заказы, которые полностью закрыты кнопкой «Собрано» в приложении сборки. */
export function buildCollectedAssemblyAllocation(
  orders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): AssemblyAllocation {
  return buildAllocationFromUnits(orders, assemblyItems, (item) => item.collectedCount);
}

export function collectedReadyOrderIds(
  orders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): Set<string> {
  const { readyByOrderId } = buildCollectedAssemblyAllocation(orders, assemblyItems);
  const ids = new Set<string>();
  for (const [id, ready] of readyByOrderId) {
    if (ready) ids.add(id);
  }
  return ids;
}

/** Заказ частично собран: не готов целиком, но сборка уже начата. */
export function isPartiallyCollectedOrder(
  order: ShippingOrder,
  allocation: AssemblyAllocation,
): boolean {
  if (order.barcodePrinted) return false;
  if (allocation.readyByOrderId.get(order.id)) return false;

  const missing = allocation.missingByOrderId.get(order.id) ?? [];
  if (missing.length === 0) return false;
  if (missing.length < order.items.length) return true;
  return missing.some((row) => row.have > 0);
}

/** Id заказов, собранных не полностью (кнопка «Собрано»). */
export function partiallyCollectedOrderIds(
  orders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): Set<string> {
  const allocation = buildCollectedAssemblyAllocation(orders, assemblyItems);
  const ids = new Set<string>();
  for (const order of orders) {
    if (isPartiallyCollectedOrder(order, allocation)) ids.add(order.id);
  }
  return ids;
}

export function getOrderAssemblyStatus(
  order: ShippingOrder,
  assemblyItems: AssemblyItem[],
  allocation?: AssemblyAllocation,
): { ready: boolean; missing: MissingAssemblyItem[] } {
  if (order.barcodePrinted) {
    return { ready: false, missing: [] };
  }

  if (allocation) {
    return {
      ready: allocation.readyByOrderId.get(order.id) ?? false,
      missing: allocation.missingByOrderId.get(order.id) ?? [],
    };
  }

  const pool = new Map<string, number>();
  for (const item of assemblyItems) {
    const key = assemblyItemKey(item.productId, item.sizeId, item.isBlogger === true);
    pool.set(key, (pool.get(key) ?? 0) + item.quantity);
  }

  const missing: MissingAssemblyItem[] = [];
  const isBlogger = orderIsBlogger(order);

  for (const item of order.items) {
    const key = assemblyItemKey(item.productId, item.sizeId, isBlogger);
    const have = pool.get(key) ?? 0;
    const need = item.quantity;

    if (have < need) {
      missing.push({
        productId: item.productId,
        sizeId: item.sizeId,
        productName: item.productName,
        size: formatSize(item.size),
        need,
        have,
      });
    }
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}
