import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import { getOrderAssemblyStatus } from "@/lib/assembly-status";

export type OrderDisplayStatus =
  | "awaiting-assembly"
  | "ready-to-ship"
  | "assembled"
  | "shipped";

export const ORDER_STATUS_LABEL: Record<OrderDisplayStatus, string> = {
  "awaiting-assembly": "Ожидает сборку",
  "ready-to-ship": "К отправке",
  assembled: "Собран",
  shipped: "Отправлен",
};

export function getOrderDisplayStatus(
  order: ShippingOrder,
  assemblyItems: AssemblyItem[],
): OrderDisplayStatus {
  const { ready } = getOrderAssemblyStatus(order, assemblyItems);
  if (!ready) return "awaiting-assembly";
  if (order.barcodePrinted) return "shipped";

  const allScanned = order.items.every((item) => item.scannedCount >= item.quantity);
  if (allScanned) return "assembled";

  return "ready-to-ship";
}
