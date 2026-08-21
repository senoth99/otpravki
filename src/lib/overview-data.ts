import { orderIsBlogger } from "@/lib/blogger-order";
import { formatSize, isMoscowToday } from "@/lib/format";
import { resolveOrderUrgency, URGENCY_WEIGHT } from "@/lib/urgency";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

export interface OverviewSize {
  size: string;
  quantity: number;
}

export interface OverviewProduct {
  productId: string;
  productName: string;
  brand: string;
  imageUrl: string;
  sizes: OverviewSize[];
  totalQty: number;
}

export interface OverviewStats {
  orders: number;
  units: number;
  models: number;
  critical: number;
  rush: number;
  blogger: number;
  notReady: number;
  shippedToday: number;
}

const SIZE_RANK: Record<string, number> = {
  XXS: 0,
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  XXXL: 7,
};

function sizeRank(size: string): number {
  const key = formatSize(size);
  if (key in SIZE_RANK) return SIZE_RANK[key];
  const numeric = Number.parseInt(key, 10);
  if (Number.isFinite(numeric)) return 20 + numeric;
  return 50;
}

function sortOverviewProducts(products: OverviewProduct[]): OverviewProduct[] {
  return products
    .map((product) => ({
      ...product,
      sizes: [...product.sizes].sort((a, b) => sizeRank(a.size) - sizeRank(b.size)),
    }))
    .sort((a, b) => b.totalQty - a.totalQty || a.productName.localeCompare(b.productName, "ru"));
}

/** Пул со склада (warehouse-capped) — для справки, не для главных цифр. */
export function groupProductsToShip(assemblyItems: AssemblyItem[]): OverviewProduct[] {
  const byProduct = new Map<string, OverviewProduct>();

  for (const item of assemblyItems) {
    if (item.quantity <= 0) continue;
    const existing = byProduct.get(item.productId);
    if (!existing) {
      byProduct.set(item.productId, {
        productId: item.productId,
        productName: item.productName,
        brand: item.brand,
        imageUrl: item.imageUrl,
        sizes: [{ size: item.size, quantity: item.quantity }],
        totalQty: item.quantity,
      });
      continue;
    }

    const sizeRow = existing.sizes.find((row) => row.size === item.size);
    if (sizeRow) sizeRow.quantity += item.quantity;
    else existing.sizes.push({ size: item.size, quantity: item.quantity });
    existing.totalQty += item.quantity;
    if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
  }

  return sortOverviewProducts([...byProduct.values()]);
}

/** Единицы и модели из активных заказов — те же заказы, что в «Заказов». */
export function groupProductsFromOrders(orders: ShippingOrder[]): OverviewProduct[] {
  const byProduct = new Map<string, OverviewProduct>();

  for (const order of orders) {
    if (order.barcodePrinted) continue;
    const brand = order.storeBrand?.trim() || "CASHER";
    for (const item of order.items) {
      if (!item.productId || item.quantity <= 0) continue;
      const existing = byProduct.get(item.productId);
      if (!existing) {
        byProduct.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          brand,
          imageUrl: item.imageUrl ?? "",
          sizes: [{ size: item.size, quantity: item.quantity }],
          totalQty: item.quantity,
        });
        continue;
      }

      const sizeRow = existing.sizes.find((row) => row.size === item.size);
      if (sizeRow) sizeRow.quantity += item.quantity;
      else existing.sizes.push({ size: item.size, quantity: item.quantity });
      existing.totalQty += item.quantity;
      if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
      if (!existing.brand) existing.brand = brand;
    }
  }

  return sortOverviewProducts([...byProduct.values()]);
}

/** Активные заказы, в которых есть эта модель. */
export function groupOrdersByProductId(orders: ShippingOrder[]): Map<string, ShippingOrder[]> {
  const map = new Map<string, ShippingOrder[]>();

  for (const order of orders) {
    if (order.barcodePrinted) continue;
    const seen = new Set<string>();
    for (const item of order.items) {
      const id = item.productId?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const list = map.get(id);
      if (list) list.push(order);
      else map.set(id, [order]);
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => {
      const urgencyDiff =
        URGENCY_WEIGHT[resolveOrderUrgency(a)] - URGENCY_WEIGHT[resolveOrderUrgency(b)];
      if (urgencyDiff !== 0) return urgencyDiff;
      return a.orderNumber.localeCompare(b.orderNumber, "ru");
    });
  }

  return map;
}

export function buildOverviewStats(
  _assemblyItems: AssemblyItem[],
  orders: ShippingOrder[],
  shippedArchive: ShippingOrder[] = [],
): OverviewStats {
  const active = orders.filter((order) => !order.barcodePrinted);
  const products = groupProductsFromOrders(orders);

  return {
    orders: active.length,
    units: products.reduce((sum, product) => sum + product.totalQty, 0),
    models: products.length,
    critical: active.filter((order) => resolveOrderUrgency(order) === "critical").length,
    rush: active.filter((order) => {
      const urgency = resolveOrderUrgency(order);
      return urgency === "rush" || urgency === "urgent";
    }).length,
    blogger: active.filter((order) => orderIsBlogger(order)).length,
    notReady: active.filter((order) => order.ready === false).length,
    shippedToday: shippedArchive.filter(
      (order) => order.barcodePrinted && order.barcodePrintedAt && isMoscowToday(order.barcodePrintedAt),
    ).length,
  };
}
