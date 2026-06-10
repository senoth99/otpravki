import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import { getImageUrl } from "@/lib/api";
import { addMoscowCalendarDays, formatMoscowDate, formatSize, isMoscowToday } from "@/lib/format";
import { URGENCY_WEIGHT } from "@/lib/urgency";
import type { ApiUnshippedOrder } from "@/types/orders-api";
import type {
  ApiProduct,
  AssemblyItem,
  OrderUrgency,
  ShippingOrder,
  ShippingOrderItem,
} from "@/types/shipping";

function assemblyKey(productSlug: string, size: string) {
  return `${productSlug}-${size.toLowerCase()}`;
}

function deriveUrgency(createdAt: string, allInStock: boolean): OrderUrgency {
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);

  if (allInStock && ageHours >= 48) return "critical";
  if (allInStock && ageHours >= 24) return "high";
  if (ageHours >= 72) return "high";
  if (ageHours >= 24) return "normal";
  return "low";
}

function formatDeadline(createdAt: string): string {
  const shipBy = addMoscowCalendarDays(createdAt, 3);
  if (isMoscowToday(shipBy)) return "Сегодня";
  return formatMoscowDate(shipBy);
}

function resolveSizeId(product: ApiProduct | undefined, size: string, lineId: number): number {
  const normalized = size.toLowerCase();
  const match = product?.sizes.find((s) => s.size.toLowerCase() === normalized);
  return match?.id ?? lineId;
}

function buildProductIndex(products: ApiProduct[]): Map<string, ApiProduct> {
  const index = new Map<string, ApiProduct>();
  for (const product of products) {
    if (!product.slug) continue;
    index.set(product.slug, product);
    index.set(product.slug.toLowerCase(), product);
  }
  return index;
}

function findProduct(index: Map<string, ApiProduct>, slug: string): ApiProduct | undefined {
  return index.get(slug) ?? index.get(slug.toLowerCase());
}

/** Заказ можно отправить разом — всё на складе */
function isFullyStockedOrder(order: ApiUnshippedOrder): boolean {
  if (!order.allInStockAtWarehouse) return false;
  return order.items.length > 0 && order.items.every((line) => line.inStockAtWarehouse);
}

export function mapUnshippedOrdersToWorkspace(
  apiOrders: ApiUnshippedOrder[],
  products: ApiProduct[],
): { assemblyItems: AssemblyItem[]; orders: ShippingOrder[] } {
  const productIndex = buildProductIndex(products);
  const assemblyMap = new Map<string, AssemblyItem>();
  const orders: ShippingOrder[] = [];

  for (const order of apiOrders) {
    if (!isFullyStockedOrder(order)) continue;

    const shippingItems: ShippingOrderItem[] = [];

    for (const line of order.items) {
      if (!line.inStockAtWarehouse) continue;

      const product = findProduct(productIndex, line.productSlug);
      const productId = line.productSlug;
      const sizeId = resolveSizeId(product, line.size, line.id);
      const key = assemblyKey(productId, line.size);
      const imagePath = product?.images[0] ?? "";

      const assemblyLine = assemblyMap.get(key);
      if (assemblyLine) {
        assemblyLine.quantity += line.quantity;
      } else {
        assemblyMap.set(key, {
          id: `assembly-${key}`,
          productId,
          productName: line.productName,
          size: formatSize(line.size),
          sizeId,
          brand: product?.brand || "CASHER",
          imageUrl: imagePath ? getImageUrl(imagePath) : "",
          barcodeId: String(sizeId),
          quantity: line.quantity,
          collectedCount: 0,
        });
      }

      shippingItems.push({
        id: String(line.id),
        productId,
        productName: line.productName,
        size: formatSize(line.size),
        sizeId,
        brand: product?.brand || "CASHER",
        imageUrl: imagePath ? getImageUrl(imagePath) : "",
        barcodeId: String(sizeId),
        quantity: line.quantity,
        scannedCount: 0,
      });
    }

    if (shippingItems.length === 0) continue;

    orders.push({
      id: String(order.id),
      orderNumber: order.orderNumber,
      customerName: order.fullName,
      urgency: deriveUrgency(order.createdAt, true),
      deadline: formatDeadline(order.createdAt),
      items: shippingItems,
      barcodeUrl: order.barcodeUrl,
      barcodePrinted: false,
      allInStockAtWarehouse: true,
      city: order.city,
      trackingNumber: order.trackingNumber ?? undefined,
    });
  }

  const assemblyItems = sortAssemblyItemsByUrgency([...assemblyMap.values()], orders);

  orders.sort((a, b) => {
    const urgencyDiff = URGENCY_WEIGHT[a.urgency] - URGENCY_WEIGHT[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return a.orderNumber.localeCompare(b.orderNumber);
  });

  return { assemblyItems, orders };
}
