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

/** Все неотправленные заказы доступны к отправке (сборка не блокирует). */
export function buildAssemblyAllocation(
  orders: ShippingOrder[],
  _assemblyItems: AssemblyItem[],
): AssemblyAllocation {
  const readyByOrderId = new Map<string, boolean>();
  const missingByOrderId = new Map<string, MissingAssemblyItem[]>();

  for (const order of orders) {
    const ready = !order.barcodePrinted;
    readyByOrderId.set(order.id, ready);
    missingByOrderId.set(order.id, []);
  }

  return { readyByOrderId, missingByOrderId };
}

export function getOrderAssemblyStatus(
  order: ShippingOrder,
  _assemblyItems: AssemblyItem[],
  allocation?: AssemblyAllocation,
): { ready: boolean; missing: MissingAssemblyItem[] } {
  if (order.barcodePrinted) {
    return { ready: false, missing: [] };
  }

  if (allocation) {
    return {
      ready: allocation.readyByOrderId.get(order.id) ?? true,
      missing: [],
    };
  }

  return { ready: true, missing: [] };
}
