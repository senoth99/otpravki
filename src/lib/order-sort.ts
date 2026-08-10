import type { OrderDisplayStatus } from "@/lib/order-status";
import { resolveOrderUrgency, URGENCY_WEIGHT } from "@/lib/urgency";
import type { ShippingOrder } from "@/types/shipping";

/** Меньше = левее в списке */
const STATUS_PRIORITY: Record<OrderDisplayStatus, number> = {
  assembled: 0,
  "ready-to-ship": 1,
  "awaiting-assembly": 2,
  shipped: 3,
};

export function compareOrdersForPicker(
  a: { order: ShippingOrder; status: OrderDisplayStatus },
  b: { order: ShippingOrder; status: OrderDisplayStatus },
): number {
  const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
  if (statusDiff !== 0) return statusDiff;

  const urgencyDiff =
    URGENCY_WEIGHT[resolveOrderUrgency(a.order)] - URGENCY_WEIGHT[resolveOrderUrgency(b.order)];
  if (urgencyDiff !== 0) return urgencyDiff;

  return a.order.orderNumber.localeCompare(b.order.orderNumber);
}

export function getSortedOrderIndices(
  orders: ShippingOrder[],
  statuses: OrderDisplayStatus[],
): number[] {
  return orders
    .map((order, index) => ({ order, index, status: statuses[index] }))
    .sort(compareOrdersForPicker)
    .map(({ index }) => index);
}

/** Первый заказ, готовый к отправке (сборка есть, ещё не отправлен) */
export function findFirstAutoOrderIndex(
  orders: ShippingOrder[],
  statuses: OrderDisplayStatus[],
): number | null {
  for (const index of getSortedOrderIndices(orders, statuses)) {
    if (orders[index].barcodePrinted) continue;
    if (statuses[index] === "awaiting-assembly" || statuses[index] === "shipped") continue;
    return index;
  }
  return null;
}
