import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import { URGENCY_WEIGHT } from "@/lib/urgency";

function itemKey(productId: string, sizeId: number) {
  return `${productId}-${sizeId}`;
}

function buildUrgencyMap(orders: ShippingOrder[]) {
  const map = new Map<string, number>();

  for (const order of orders) {
    if (order.barcodePrinted) continue;
    const weight = URGENCY_WEIGHT[order.urgency];
    for (const item of order.items) {
      const key = itemKey(item.productId, item.sizeId);
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
    const weightA = urgencyMap.get(itemKey(a.productId, a.sizeId)) ?? 999;
    const weightB = urgencyMap.get(itemKey(b.productId, b.sizeId)) ?? 999;

    if (weightA !== weightB) return weightA - weightB;
    return a.productName.localeCompare(b.productName, "ru");
  });
}
