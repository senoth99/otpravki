import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { AssemblyItem, ShippingOrder, ShippingOrderItem } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

function mergeAssemblyProgress(prev: AssemblyItem, fresh: AssemblyItem): AssemblyItem {
  return {
    ...fresh,
    collectedCount: Math.min(prev.collectedCount, fresh.quantity),
    collectedAt: prev.collectedAt,
  };
}

function mergeOrderItemProgress(prev: ShippingOrderItem, fresh: ShippingOrderItem): ShippingOrderItem {
  return {
    ...fresh,
    scannedCount: Math.min(prev.scannedCount, fresh.quantity),
    scannedAt: prev.scannedAt,
  };
}

function mergeOrderProgress(prev: ShippingOrder, fresh: ShippingOrder): ShippingOrder {
  const prevItems = new Map(prev.items.map((item) => [item.id, item]));
  return {
    ...fresh,
    barcodePrinted: prev.barcodePrinted,
    barcodePrintedAt: prev.barcodePrintedAt,
    items: fresh.items.map((item) => {
      const old = prevItems.get(item.id);
      return old ? mergeOrderItemProgress(old, item) : item;
    }),
  };
}

/** Свежие данные с API + архив отправленных (никогда не очищается) */
export function mergeFreshOrdersData(
  existing: SharedWorkspaceState,
  fresh: { assemblyItems: AssemblyItem[]; orders: ShippingOrder[] },
): SharedWorkspaceState {
  const archiveById = new Map(
    mergeShippedArchives(existing.shippedArchive ?? [], existing.orders).map((order) => [
      order.id,
      order,
    ]),
  );

  const existingOrders = new Map(existing.orders.map((order) => [order.id, order]));
  const existingAssembly = new Map(existing.assemblyItems.map((item) => [item.id, item]));
  const activeOrders: ShippingOrder[] = [];

  for (const order of fresh.orders) {
    const archived = archiveById.get(order.id);
    if (!archived) {
      const prev = existingOrders.get(order.id);
      activeOrders.push(prev ? mergeOrderProgress(prev, order) : order);
      continue;
    }

    archiveById.set(order.id, {
      ...archived,
      customerName: order.customerName,
      trackingNumber: order.trackingNumber ?? archived.trackingNumber,
      barcodeUrl: order.barcodeUrl || archived.barcodeUrl,
    });
  }

  const shippedArchive = [...archiveById.values()].sort(
    (a, b) => (b.barcodePrintedAt ?? 0) - (a.barcodePrintedAt ?? 0),
  );

  const assemblyItems = fresh.assemblyItems.map((item) => {
    const prev = existingAssembly.get(item.id);
    return prev ? mergeAssemblyProgress(prev, item) : item;
  });

  return {
    ...existing,
    assemblyItems,
    orders: activeOrders,
    shippedArchive,
    apiOrderIds: fresh.orders.map((order) => order.id),
    updatedAt: Date.now(),
  };
}
