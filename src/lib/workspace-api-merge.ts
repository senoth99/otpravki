import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

/** Свежие данные с API + только отправленные заказы из текущего состояния */
export function mergeFreshOrdersData(
  existing: SharedWorkspaceState,
  fresh: { assemblyItems: AssemblyItem[]; orders: ShippingOrder[] },
): SharedWorkspaceState {
  const shippedById = new Map(
    existing.orders
      .filter((order) => order.barcodePrinted)
      .map((order) => [order.id, order]),
  );
  const freshOrderIds = new Set(fresh.orders.map((order) => order.id));

  const orders = fresh.orders.map((order) => {
    const shipped = shippedById.get(order.id);
    if (!shipped) return order;

    return {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        scannedCount: item.quantity,
        scannedAt: shipped.barcodePrintedAt,
      })),
      barcodePrinted: true,
      barcodePrintedAt: shipped.barcodePrintedAt,
      barcodeUrl: order.barcodeUrl || shipped.barcodeUrl,
    };
  });

  for (const shipped of shippedById.values()) {
    if (!freshOrderIds.has(shipped.id)) {
      orders.push(shipped);
    }
  }

  return {
    ...existing,
    assemblyItems: fresh.assemblyItems,
    orders,
    apiOrderIds: fresh.orders.map((order) => order.id),
    updatedAt: Date.now(),
  };
}
