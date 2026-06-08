import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

export function mergeFreshOrdersData(
  existing: SharedWorkspaceState,
  fresh: { assemblyItems: AssemblyItem[]; orders: ShippingOrder[] },
): SharedWorkspaceState {
  const assemblyProgress = new Map(
    existing.assemblyItems.map((item) => [`${item.productId}-${item.sizeId}`, item]),
  );

  const assemblyItems = fresh.assemblyItems.map((item) => {
    const prev = assemblyProgress.get(`${item.productId}-${item.sizeId}`);
    if (!prev) return item;

    return {
      ...item,
      collectedCount: Math.min(prev.collectedCount, item.quantity),
      collectedAt: prev.collectedAt,
    };
  });

  const existingOrders = new Map(existing.orders.map((order) => [order.id, order]));

  const orders = fresh.orders.map((order) => {
    const prev = existingOrders.get(order.id);
    if (!prev) return order;

    const prevItems = new Map(prev.items.map((item) => [item.id, item]));
    const items = order.items.map((item) => {
      const prevItem = prevItems.get(item.id);
      if (!prevItem) return item;

      return {
        ...item,
        scannedCount: Math.min(prevItem.scannedCount, item.quantity),
        scannedAt: prevItem.scannedAt,
      };
    });

    return {
      ...order,
      items,
      barcodePrinted: prev.barcodePrinted,
      barcodePrintedAt: prev.barcodePrintedAt,
      barcodeUrl: order.barcodeUrl || prev.barcodeUrl,
    };
  });

  return {
    ...existing,
    assemblyItems,
    orders,
    updatedAt: Date.now(),
  };
}
