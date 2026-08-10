import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import { isBloggerOrder } from "@/lib/blogger-order";
import { getImageUrl } from "@/lib/api";
import { addMoscowCalendarDays, formatMoscowDate, formatSize, isMoscowToday } from "@/lib/format";
import { deriveUrgency, hasRushTag, mapOrderTags, resolveOrderUrgency, URGENCY_WEIGHT } from "@/lib/urgency";
import type { ApiUnshippedOrderWithBrand } from "@/lib/server/orders-api";
import type {
  ApiProduct,
  AssemblyItem,
  ShippingOrder,
  ShippingOrderItem,
} from "@/types/shipping";

function assemblyKey(productSlug: string, size: string, isBlogger: boolean, storeBrand?: string) {
  const base = `${storeBrand ?? "brandless"}-${productSlug}-${size.toLowerCase()}`;
  return isBlogger ? `${base}-blogger` : base;
}

function normalizeCity(city: string | undefined | null): string | undefined {
  const trimmed = city?.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return undefined;
  return trimmed;
}

function normalizeComment(comment: string | undefined | null): string | undefined {
  const trimmed = comment?.trim();
  return trimmed || undefined;
}

function formatDeadline(createdAt: string): string {
  const shipBy = addMoscowCalendarDays(createdAt, 3);
  if (isMoscowToday(shipBy)) return "Сегодня";
  return formatMoscowDate(shipBy);
}

function resolveSizeId(product: ApiProduct | undefined, size: string): number | null {
  if (!product) return null;
  const normalized = size.toLowerCase();
  const match = product.sizes.find((s) => s.size.toLowerCase() === normalized);
  return match?.id ?? null;
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

function resolveWarehouseCap(line: {
  warehouseQuantity: number;
  effectiveWarehouseQuantity?: number;
}): number {
  const effective = line.effectiveWarehouseQuantity;
  if (typeof effective === "number" && Number.isFinite(effective) && effective > 0) {
    return effective;
  }
  return Math.max(0, line.warehouseQuantity ?? 0);
}
  if (!order.allInStockAtWarehouse) return false;
  return order.items.length > 0 && order.items.every((line) => line.inStockAtWarehouse);
}

export function mapUnshippedOrdersToWorkspace(
  apiOrders: ApiUnshippedOrderWithBrand[],
  products: ApiProduct[],
): { assemblyItems: AssemblyItem[]; orders: ShippingOrder[] } {
  const productIndex = buildProductIndex(products);
  const assemblyMap = new Map<string, AssemblyItem>();
  const warehouseCapByKey = new Map<string, number>();
  const orders: ShippingOrder[] = [];

  for (const order of apiOrders) {
    if (!isFullyStockedOrder(order)) continue;

    const shippingItems: ShippingOrderItem[] = [];
    const isBlogger = isBloggerOrder(order.orderNumber);

    for (const line of order.items) {
      if (!line.inStockAtWarehouse) continue;

      const product = findProduct(productIndex, line.productSlug);
      const productId = line.productSlug;
      const sizeId = resolveSizeId(product, line.size);
      if (sizeId === null) continue;

      const key = assemblyKey(productId, line.size, isBlogger, order.storeBrand);
      const imagePath = product?.images[0] ?? "";

      warehouseCapByKey.set(
        key,
        Math.max(warehouseCapByKey.get(key) ?? 0, resolveWarehouseCap(line)),
      );

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
          brand: order.storeBrand ?? product?.brand ?? "CASHER",
          imageUrl: imagePath ? getImageUrl(imagePath) : "",
          barcodeId: String(sizeId),
          quantity: line.quantity,
          collectedCount: 0,
          isBlogger,
        });
      }

      shippingItems.push({
        id: `${order.storeBrand ?? "CASHER"}:${line.id}`,
        productId,
        productName: line.productName,
        size: formatSize(line.size),
        sizeId,
        brand: order.storeBrand ?? product?.brand ?? "CASHER",
        imageUrl: imagePath ? getImageUrl(imagePath) : "",
        barcodeId: String(sizeId),
        quantity: line.quantity,
        scannedCount: 0,
      });
    }

    if (shippingItems.length === 0) continue;

    const staffComments = Array.isArray(order.staffComments)
      ? order.staffComments.filter((comment) => comment.body.trim())
      : undefined;
    const tags = mapOrderTags(order.tags);

    orders.push({
      id: `${(order.storeBrand ?? "CASHER").toLowerCase()}:${order.remoteOrderId}`,
      remoteOrderId: order.remoteOrderId,
      storeBrand: order.storeBrand,
      orderNumber: order.orderNumber,
      isBlogger,
      customerName: order.fullName,
      createdAt: order.createdAt,
      urgency: hasRushTag(tags) ? "rush" : deriveUrgency(order.createdAt),
      deadline: formatDeadline(order.createdAt),
      items: shippingItems,
      barcodeUrl: order.barcodeUrl,
      barcodePrinted: false,
      allInStockAtWarehouse: true,
      city: normalizeCity(order.city),
      trackingNumber: order.trackingNumber ?? undefined,
      customerComment: normalizeComment(order.customerComment),
      staffComments: staffComments?.length ? staffComments : undefined,
      tags,
    });
  }

  for (const [key, item] of assemblyMap) {
    const cap = warehouseCapByKey.get(key);
    if (cap !== undefined) {
      item.quantity = Math.min(item.quantity, cap);
    }
  }

  const assemblyItems = sortAssemblyItemsByUrgency([...assemblyMap.values()], orders);

  orders.sort((a, b) => {
    const urgencyDiff =
      URGENCY_WEIGHT[resolveOrderUrgency(a)] - URGENCY_WEIGHT[resolveOrderUrgency(b)];
    if (urgencyDiff !== 0) return urgencyDiff;
    return a.orderNumber.localeCompare(b.orderNumber);
  });

  return { assemblyItems, orders };
}
