import { assemblyItemKey } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import { URGENCY_WEIGHT } from "@/lib/urgency";

function buildUrgencyMap(orders: ShippingOrder[]) {
  const map = new Map<string, number>();

  for (const order of orders) {
    if (order.barcodePrinted) continue;
    const weight = URGENCY_WEIGHT[order.urgency];
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

export function sortAssemblyItemsByUrgency(
  items: AssemblyItem[],
  orders: ShippingOrder[],
): AssemblyItem[] {
  const urgencyMap = buildUrgencyMap(orders);

  return [...items].sort((a, b) => {
    const weightA = urgencyMap.get(assemblyItemKey(a.productId, a.sizeId, a.isBlogger === true)) ?? 999;
    const weightB = urgencyMap.get(assemblyItemKey(b.productId, b.sizeId, b.isBlogger === true)) ?? 999;

    if (weightA !== weightB) return weightA - weightB;
    return a.productName.localeCompare(b.productName, "ru");
  });
}
