import { assemblyItemKey } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import { formatSize } from "@/lib/format";
import { resolveOrderUrgency, URGENCY_WEIGHT } from "@/lib/urgency";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

export interface MissingAssemblyItem {
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
 * Готовность к отправке по наличию в пуле сборки (quantity из API),
 * без учёта кнопки «Собрано» (collectedCount).
 */
export function buildAssemblyAllocation(
  orders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): AssemblyAllocation {
  const pool = new Map<string, number>();
  for (const item of assemblyItems) {
    const key = assemblyItemKey(item.productId, item.sizeId, item.isBlogger === true);
    pool.set(key, (pool.get(key) ?? 0) + item.quantity);
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
