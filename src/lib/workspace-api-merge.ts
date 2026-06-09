import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

/** Свежие данные с API + архив отправленных (никогда не очищается) */
export function mergeFreshOrdersData(
  existing: SharedWorkspaceState,
  fresh: { assemblyItems: AssemblyItem[]; orders: ShippingOrder[] },
): SharedWorkspaceState {
  const shippedArchive = mergeShippedArchives(
    existing.shippedArchive ?? [],
    existing.orders,
  );
  const archiveById = new Map(shippedArchive.map((order) => [order.id, order]));
  const freshOrderIds = new Set(fresh.orders.map((order) => order.id));

  const orders: ShippingOrder[] = [];

  for (const order of fresh.orders) {
    const archived = archiveById.get(order.id);
    if (!archived) {
      orders.push(order);
      continue;
    }

    const merged: ShippingOrder = {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        scannedCount: item.quantity,
        scannedAt: archived.barcodePrintedAt,
      })),
      barcodePrinted: true,
      barcodePrintedAt: archived.barcodePrintedAt,
      barcodeUrl: order.barcodeUrl || archived.barcodeUrl,
    };
    orders.push(merged);
    archiveById.set(order.id, merged);
  }

  for (const archived of archiveById.values()) {
    if (!freshOrderIds.has(archived.id)) {
      orders.push(archived);
    }
  }

  return {
    ...existing,
    assemblyItems: fresh.assemblyItems,
    orders,
    shippedArchive: [...archiveById.values()].sort(
      (a, b) => (b.barcodePrintedAt ?? 0) - (a.barcodePrintedAt ?? 0),
    ),
    apiOrderIds: fresh.orders.map((order) => order.id),
    updatedAt: Date.now(),
  };
}
