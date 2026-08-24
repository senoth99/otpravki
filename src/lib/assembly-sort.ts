import { assemblyItemKey } from "@/lib/assembly-demand";
import { orderIsBlogger } from "@/lib/blogger-order";
import { resolveOrderUrgency, URGENCY_WEIGHT } from "@/lib/urgency";
import type { OrderUrgency } from "@/types/shipping";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

function buildUrgencyMap(orders: ShippingOrder[]) {
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

export function resolveAssemblyItemUrgency(
  item: Pick<AssemblyItem, "productId" | "sizeId" | "isBlogger">,
  orders: ShippingOrder[],
): OrderUrgency {
  const key = assemblyItemKey(item.productId, item.sizeId, item.isBlogger === true);
  const urgencyMap = buildUrgencyMap(orders);
  const weight = urgencyMap.get(key) ?? 999;

  const entry = (Object.entries(URGENCY_WEIGHT) as [OrderUrgency, number][]).find(
    ([, value]) => value === weight,
  );
  return entry?.[0] ?? "normal";
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
