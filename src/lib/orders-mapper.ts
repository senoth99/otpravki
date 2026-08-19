import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import { isBloggerOrder } from "@/lib/blogger-order";
import { getImageUrl } from "@/lib/api";
import { addMoscowCalendarDays, formatMoscowDate, formatSize, isMoscowToday } from "@/lib/format";
import { deriveUrgency, hasRushTag, mapOrderTags, resolveOrderUrgency, URGENCY_WEIGHT } from "@/lib/urgency";
import type { ApiUnshippedOrderWithBrand } from "@/lib/server/orders-api";
import { isStockGatedLine, type ApiOrderLineItem } from "@/types/orders-api";
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
  warehouseQuantity: number | null;
  effectiveWarehouseQuantity?: number;
}): number | undefined {
  if (line.warehouseQuantity == null) return undefined;
  const warehouse = Math.max(0, line.warehouseQuantity);
  const effective = line.effectiveWarehouseQuantity;
  if (typeof effective === "number" && Number.isFinite(effective) && effective > warehouse) {
    return effective;
  }
  return warehouse;
}

function normalizeChestnyZnak(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

function resolveLineSizeId(product: ApiProduct | undefined, line: ApiOrderLineItem): number | null {
  return resolveSizeId(product, line.size) ?? line.sizeId ?? null;
}

function isShippedApiStatus(status: string | undefined | null): boolean {
  const value = status?.trim().toLowerCase();
  return value === "shipped" || value === "delivered" || value === "completed";
}

/** Есть ли хоть один товар в наличии (не блокируем отображение, но помечаем) */
function isOrderReady(order: ApiUnshippedOrderWithBrand): boolean {
  // Новый флаг с 19.08.2026 — используем его если есть
  if (typeof order.ready === "boolean") return order.ready;
  // Фолбэк: старая логика
  if (order.items.length === 0) return false;
  const gated = order.items.filter(isStockGatedLine);
  if (gated.length === 0) return true;
  return gated.every((line) => line.inStockAtWarehouse);
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
    if (isShippedApiStatus(order.status)) continue;

    const ready = isOrderReady(order);
    const shippingItems: ShippingOrderItem[] = [];
    const isBlogger = isBloggerOrder(order.orderNumber);

    // Для !ready всё равно строим список позиций которые есть, чтобы видеть заказ
    for (const line of order.items) {
      if (isStockGatedLine(line) && !line.inStockAtWarehouse && ready) continue;

      const product = findProduct(productIndex, line.productSlug);
      const productId = line.productSlug;
      const sizeId = resolveLineSizeId(product, line);
      if (sizeId === null) continue;

      const key = assemblyKey(productId, line.size, isBlogger, order.storeBrand);
      const imagePath = product?.images[0] ?? line.imagePath ?? "";

      const cap = resolveWarehouseCap(line);
      if (cap !== undefined) {
        warehouseCapByKey.set(key, Math.max(warehouseCapByKey.get(key) ?? 0, cap));
      }

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
        chestnyZnak: normalizeChestnyZnak(line.chestnyZnak),
      });
    }

    if (shippingItems.length === 0 && !ready) {
      // Заказ без ничего в наличии — всё равно добавляем с пустым списком позиций
      // чтобы он был виден при фильтре «все»; позиции пустые — скан невозможен
    } else if (shippingItems.length === 0) {
      continue;
    }

    const staffComments = Array.isArray(order.staffComments)
      ? order.staffComments.filter((comment) => comment.body.trim())
      : undefined;
    const tags = mapOrderTags(order.tags);

    const missingItems = (!ready && Array.isArray(order.missingLines) && order.missingLines.length > 0)
      ? order.missingLines.map((ml) => ({
          productName: ml.productName,
          size: ml.size,
          quantity: ml.quantity,
          availableForThisOrder: ml.availableForThisOrder,
        }))
      : undefined;

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
      allInStockAtWarehouse: ready,
      ready,
      missingItems,
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
