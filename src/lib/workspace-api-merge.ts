import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

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

  const activeOrders: ShippingOrder[] = [];

  for (const order of fresh.orders) {
    const archived = archiveById.get(order.id);
    if (!archived) {
      activeOrders.push(order);
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

  return {
    ...existing,
    assemblyItems: fresh.assemblyItems,
    orders: activeOrders,
    shippedArchive,
    apiOrderIds: fresh.orders.map((order) => order.id),
    updatedAt: Date.now(),
  };
}
