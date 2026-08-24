import { matchesStoreBrand } from "@/lib/store-brand";
import type { OrderDisplayStatus } from "@/lib/order-status";
import type { ShippingOrder } from "@/types/shipping";

/** Сравнение номеров заказа: 1, 2, 3… а не 1, 10, 2. */
export function compareOrderNumbers(a: string, b: string): number {
  const left = a ?? "";
  const right = b ?? "";
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function compareOrdersForPicker(
  a: { order: ShippingOrder; status: OrderDisplayStatus },
  b: { order: ShippingOrder; status: OrderDisplayStatus },
): number {
  return compareOrderNumbers(a.order.orderNumber, b.order.orderNumber);
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

/**
 * Следующий неотправленный заказ в очереди пикера (по номеру).
 * Если `fromId` уже выпал из списка (после печати уходит из filteredOrders),
 * продолжаем с места после `afterOrderNumber`.
 */
export function findNextActiveOrderId(
  orders: ShippingOrder[],
  statuses: OrderDisplayStatus[],
  fromId: string | null,
  brand: string,
  options?: { afterOrderNumber?: string | null },
): string | null {
  const brandIndices = orders
    .map((_, index) => index)
    .filter((index) => matchesStoreBrand(orders[index].storeBrand, brand));

  if (brandIndices.length === 0) return null;

  const sortedIndices = getSortedOrderIndices(
    brandIndices.map((index) => orders[index]),
    brandIndices.map((index) => statuses[index]),
  ).map((localPos) => brandIndices[localPos]);

  let fromPos = fromId
    ? sortedIndices.findIndex((index) => orders[index].id === fromId)
    : -1;

  if (fromPos < 0 && options?.afterOrderNumber) {
    // Заказа уже нет в списке — встаём после последнего с номером ≤ отправленного
    fromPos = -1;
    for (let i = 0; i < sortedIndices.length; i++) {
      const number = orders[sortedIndices[i]].orderNumber;
      if (compareOrderNumbers(number, options.afterOrderNumber) <= 0) {
        fromPos = i;
      } else {
        break;
      }
    }
  }

  const start = fromPos >= 0 ? fromPos + 1 : 0;
  for (let step = 0; step < sortedIndices.length; step++) {
    const pos = (start + step) % sortedIndices.length;
    if (fromPos >= 0 && pos === fromPos) continue;
    const index = sortedIndices[pos];
    if (!orders[index].barcodePrinted) {
      return orders[index].id;
    }
  }
  return null;
}

/** Первый заказ, готовый к отправке (сборка есть, ещё не отправлен) — по номеру */
export function findFirstAutoOrderIndex(
  orders: ShippingOrder[],
  statuses: OrderDisplayStatus[],
): number | null {
  for (const index of getSortedOrderIndices(orders, statuses)) {
    if (orders[index].barcodePrinted) continue;
    if (statuses[index] === "awaiting-assembly" || statuses[index] === "partial-assembly" || statuses[index] === "shipped") continue;
    return index;
  }
  return null;
}
