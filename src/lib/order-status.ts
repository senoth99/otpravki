import type { AssemblyAllocation } from "@/lib/assembly-status";
import { getOrderAssemblyStatus, isPartiallyCollectedOrder } from "@/lib/assembly-status";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

export type OrderDisplayStatus =
  | "awaiting-assembly"
  | "partial-assembly"
  | "ready-to-ship"
  | "assembled"
  | "shipped";

export const ORDER_STATUS_LABEL: Record<OrderDisplayStatus, string> = {
  "awaiting-assembly": "Ожидает сборку",
  "partial-assembly": "Частично собран",
  "ready-to-ship": "К отправке",
  assembled: "Собран",
  shipped: "Отправлен",
};

export function getOrderDisplayStatus(
  order: ShippingOrder,
  assemblyItems: AssemblyItem[],
  allocation?: AssemblyAllocation,
): OrderDisplayStatus {
  if (order.barcodePrinted) return "shipped";
  const { ready } = getOrderAssemblyStatus(order, assemblyItems, allocation);
  if (!ready) {
    if (allocation && isPartiallyCollectedOrder(order, allocation)) {
      return "partial-assembly";
    }
    return "awaiting-assembly";
  }

  const allScanned = order.items.every((item) => item.scannedCount >= item.quantity);
  if (allScanned) return "assembled";

  return "ready-to-ship";
}
