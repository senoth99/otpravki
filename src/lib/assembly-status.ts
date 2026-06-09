import { assemblyItemKey } from "@/lib/assembly-demand";
import { formatSize } from "@/lib/format";
import { URGENCY_WEIGHT } from "@/lib/urgency";
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

/** Распределяет пул сборки между заказами по приоритету срочности */
export function buildAssemblyAllocation(
  orders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): AssemblyAllocation {
  const pool = new Map<string, number>();
  for (const item of assemblyItems) {
    pool.set(assemblyItemKey(item.productId, item.sizeId), item.collectedCount);
  }

  const readyByOrderId = new Map<string, boolean>();
  const missingByOrderId = new Map<string, MissingAssemblyItem[]>();

  const activeOrders = orders
    .filter((order) => !order.barcodePrinted)
    .sort((a, b) => {
      const urgencyDiff = URGENCY_WEIGHT[a.urgency] - URGENCY_WEIGHT[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      return a.orderNumber.localeCompare(b.orderNumber, "ru");
    });

  for (const order of activeOrders) {
    const missing: MissingAssemblyItem[] = [];
    let ready = true;

    for (const line of order.items) {
      const key = assemblyItemKey(line.productId, line.sizeId);
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
        const key = assemblyItemKey(line.productId, line.sizeId);
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

  const pool = new Map(
    assemblyItems.map((item) => [assemblyItemKey(item.productId, item.sizeId), item.collectedCount]),
  );

  const missing: MissingAssemblyItem[] = [];

  for (const item of order.items) {
    const key = assemblyItemKey(item.productId, item.sizeId);
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
