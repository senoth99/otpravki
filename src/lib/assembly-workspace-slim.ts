import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

/** Урезаем заказы для сборки: без архива, без тяжёлых полей строк — меньше HTML/памяти. */
export function slimOrdersForAssembly(orders: ShippingOrder[]): ShippingOrder[] {
  return orders
    .filter((order) => !order.barcodePrinted)
    .map((order) => ({
      id: order.id,
      remoteOrderId: order.remoteOrderId,
      storeBrand: order.storeBrand,
      orderNumber: order.orderNumber,
      isBlogger: order.isBlogger,
      customerName: order.customerName || "",
      createdAt: order.createdAt,
      urgency: order.urgency,
      deadline: order.deadline || "",
      barcodePrinted: false,
      city: order.city,
      tags: order.tags,
      ready: order.ready,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        size: item.size,
        sizeId: item.sizeId,
        brand: item.brand,
        imageUrl: "",
        barcodeId: item.barcodeId || "",
        quantity: item.quantity,
        scannedCount: 0,
      })),
    }));
}

export function slimAssemblyItems(items: AssemblyItem[]): AssemblyItem[] {
  return items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    size: item.size,
    sizeId: item.sizeId,
    brand: item.brand,
    imageUrl: item.imageUrl,
    barcodeId: item.barcodeId,
    quantity: item.quantity,
    collectedCount: 0,
    isBlogger: item.isBlogger,
  }));
}

export function slimWorkspaceForAssembly(
  workspace: SharedWorkspaceState,
): Pick<
  SharedWorkspaceState,
  "assemblyItems" | "orders" | "apiOrderIds" | "shippedArchive" | "revision"
> {
  return {
    assemblyItems: slimAssemblyItems(workspace.assemblyItems),
    orders: slimOrdersForAssembly(workspace.orders),
    apiOrderIds: workspace.apiOrderIds ?? [],
    shippedArchive: [],
    revision: workspace.revision,
  };
}
