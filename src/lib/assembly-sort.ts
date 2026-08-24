import { assemblyItemKey } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import { resolveOrderUrgency, URGENCY_WEIGHT } from "@/lib/urgency";
import type { OrderUrgency } from "@/types/shipping";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

const WEIGHT_TO_URGENCY = (Object.entries(URGENCY_WEIGHT) as [OrderUrgency, number][]).sort(
  (a, b) => a[1] - b[1],
);

function weightToUrgency(weight: number): OrderUrgency {
  for (const [urgency, value] of WEIGHT_TO_URGENCY) {
    if (value === weight) return urgency;
  }
  return "normal";
}

export function buildAssemblyUrgencyMap(orders: ShippingOrder[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const order of orders) {
    if (order.barcodePrinted) continue;
    const weight = URGENCY_WEIGHT[resolveOrderUrgency(order)];
    const isBlogger = orderIsBlogger(order);
    for (const item of order.items) {
      const key = assemblyItemKey(item.productId, item.sizeId, isBlogger);
      const current = map.get(key);
      if (current === undefined || weight < current) {
        map.set(key, weight);
      }
    }
  }

  return map;
}

export function resolveAssemblyItemUrgencyFromMap(
  item: Pick<AssemblyItem, "productId" | "sizeId" | "isBlogger">,
  urgencyMap: Map<string, number>,
): OrderUrgency {
  const key = assemblyItemKey(item.productId, item.sizeId, item.isBlogger === true);
  return weightToUrgency(urgencyMap.get(key) ?? 999);
}

export function resolveAssemblyItemUrgency(
  item: Pick<AssemblyItem, "productId" | "sizeId" | "isBlogger">,
  orders: ShippingOrder[],
): OrderUrgency {
  return resolveAssemblyItemUrgencyFromMap(item, buildAssemblyUrgencyMap(orders));
}

export function sortAssemblyItemsByUrgency(
  items: AssemblyItem[],
  orders: ShippingOrder[],
): AssemblyItem[] {
  const urgencyMap = buildAssemblyUrgencyMap(orders);

  return [...items].sort((a, b) => {
    const weightA = urgencyMap.get(assemblyItemKey(a.productId, a.sizeId, a.isBlogger === true)) ?? 999;
    const weightB = urgencyMap.get(assemblyItemKey(b.productId, b.sizeId, b.isBlogger === true)) ?? 999;

    if (weightA !== weightB) return weightA - weightB;
    return a.productName.localeCompare(b.productName, "ru");
  });
}
