import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import { orderIsBlogger } from "@/lib/blogger-order";
import type { AssemblyProgressEntry } from "@/types/assembly-progress";
import type { AssemblyItem, ShippingOrder, ShippingOrderItem } from "@/types/shipping";

export function assemblyItemKey(productId: string, sizeId: number, isBlogger = false): string {
  const base = `${productId}-${sizeId}`;
  return isBlogger ? `${base}-blogger` : base;
}

function itemPoolKey(item: { productId: string; sizeId: number; isBlogger?: boolean }): string {
  return assemblyItemKey(item.productId, item.sizeId, item.isBlogger === true);
}

/** Сколько ещё нужно собрать по каждой позиции (только неотправленные заказы) */
export function computeAssemblyDemand(orders: ShippingOrder[]): Map<string, number> {
  const demand = new Map<string, number>();

  for (const order of orders) {
    if (order.barcodePrinted) continue;
    const isBlogger = orderIsBlogger(order);
    for (const item of order.items) {
      const key = assemblyItemKey(item.productId, item.sizeId, isBlogger);
      demand.set(key, (demand.get(key) ?? 0) + item.quantity);
    }
  }

  return demand;
}

function enrichAssemblyItems(items: AssemblyItem[], orders: ShippingOrder[]): AssemblyItem[] {
  const activeOrders = orders.filter((order) => !order.barcodePrinted);
  const demand = computeAssemblyDemand(activeOrders);

  return items
    .map((item) => {
      const key = itemPoolKey(item);
      const needed = demand.get(key) ?? 0;
      if (needed === 0) return null;
      return { ...item, quantity: needed };
    })
    .filter((item): item is AssemblyItem => item !== null);
}

export interface AssemblyViewSections {
  pending: AssemblyItem[];
  completed: AssemblyItem[];
}

export function computeCompletedAssemblyIds(
  items: AssemblyItem[],
  orders: ShippingOrder[],
): string[] {
  return enrichAssemblyItems(items, orders)
    .filter((item) => item.collectedCount >= item.quantity)
    .map((item) => item.id);
}

/**
 * settled=false — все позиции в одном списке (собранные остаются на месте).
 * settled=true — несобранные сверху, собранные снизу.
 * pinnedCompletedIds — секции не пересчитываются при +/- до следующего входа на вкладку.
 */
export function getAssemblyViewSections(
  items: AssemblyItem[],
  orders: ShippingOrder[],
  settled: boolean,
  pinnedCompletedIds?: ReadonlySet<string>,
): AssemblyViewSections {
  const activeOrders = orders.filter((order) => !order.barcodePrinted);
  const enriched = enrichAssemblyItems(items, orders);

  if (!settled) {
    return {
      pending: sortAssemblyItemsByUrgency(enriched, activeOrders),
      completed: [],
    };
  }

  if (pinnedCompletedIds) {
    const completed = enriched.filter((item) => pinnedCompletedIds.has(item.id));
    const pending = enriched.filter((item) => !pinnedCompletedIds.has(item.id));

    return {
      pending: sortAssemblyItemsByUrgency(pending, activeOrders),
      completed: sortAssemblyItemsByUrgency(completed, activeOrders),
    };
  }

  const pending = enriched.filter((item) => item.collectedCount < item.quantity);
  const completed = enriched.filter((item) => item.collectedCount >= item.quantity);

  return {
    pending: sortAssemblyItemsByUrgency(pending, activeOrders),
    completed: sortAssemblyItemsByUrgency(completed, activeOrders),
  };
}

export function assemblyItemIdFromOrderLine(
  order: ShippingOrder,
  line: Pick<ShippingOrderItem, "productId" | "size" | "brand">,
): string {
  const brand = (order.storeBrand ?? line.brand ?? "CASHER").trim() || "brandless";
  const base = `${brand}-${line.productId}-${line.size.trim().toLowerCase()}`;
  return orderIsBlogger(order) ? `assembly-${base}-blogger` : `assembly-${base}`;
}

function orderLineMatchesAssembly(assemblyItem: AssemblyItem, order: ShippingOrder, line: ShippingOrderItem): boolean {
  const isBlogger = orderIsBlogger(order);
  if ((assemblyItem.isBlogger === true) !== isBlogger) return false;
  if (assemblyItemKey(line.productId, line.sizeId, isBlogger) === itemPoolKey(assemblyItem)) {
    return true;
  }
  const sameProduct = assemblyItem.productId === line.productId;
  const sameSize = assemblyItem.size.trim().toLowerCase() === line.size.trim().toLowerCase();
  const itemBrand = (assemblyItem.brand?.trim() || "CASHER").toLowerCase();
  const lineBrand = (line.brand?.trim() || order.storeBrand?.trim() || "CASHER").toLowerCase();
  return sameProduct && sameSize && itemBrand === lineBrand;
}

function shippedQtyForAssemblyItem(assemblyItem: AssemblyItem, order: ShippingOrder): number {
  return order.items.reduce((sum, line) => {
    return orderLineMatchesAssembly(assemblyItem, order, line) ? sum + line.quantity : sum;
  }, 0);
}

/** Заказы, которые стали отправленными между двумя снимками workspace */
export function newlyShippedOrders(
  prevOrders: ShippingOrder[],
  prevArchive: ShippingOrder[] | undefined,
  nextOrders: ShippingOrder[],
  nextArchive: ShippingOrder[] | undefined,
): ShippingOrder[] {
  const wasShipped = new Set(
    [...prevOrders, ...(prevArchive ?? [])]
      .filter((order) => order.barcodePrinted)
      .map((order) => order.id),
  );
  const seen = new Set<string>();
  const result: ShippingOrder[] = [];

  for (const order of [...nextOrders, ...(nextArchive ?? [])]) {
    if (!order.barcodePrinted || wasShipped.has(order.id) || seen.has(order.id)) continue;
    seen.add(order.id);
    result.push(order);
  }

  return result;
}

/** Списать «собрано» по отгруженным строкам (ключи = AssemblyItem.id) */
export function assemblyProgressPatchForShippedOrders(
  progressItems: Record<string, AssemblyProgressEntry>,
  shipped: ShippingOrder[],
): Record<string, AssemblyProgressEntry> {
  if (shipped.length === 0) return {};

  const shippedById = new Map<string, number>();
  for (const order of shipped) {
    for (const line of order.items) {
      const id = assemblyItemIdFromOrderLine(order, line);
      shippedById.set(id, (shippedById.get(id) ?? 0) + line.quantity);
    }
  }

  const patch: Record<string, AssemblyProgressEntry> = {};
  for (const [id, shippedQty] of shippedById) {
    const entry = progressItems[id];
    if (!entry || entry.collectedCount <= 0) continue;
    const nextCount = Math.max(0, entry.collectedCount - shippedQty);
    if (nextCount === entry.collectedCount) continue;
    patch[id] = {
      collectedCount: nextCount,
      collectedAt: nextCount > 0 ? entry.collectedAt : undefined,
    };
  }
  return patch;
}

/** Списывает собранные единицы после отправки заказа */
export function consumeAssemblyForOrder(
  assemblyItems: AssemblyItem[],
  order: ShippingOrder,
): AssemblyItem[] {
  return assemblyItems.map((assemblyItem) => {
    const shippedQty = shippedQtyForAssemblyItem(assemblyItem, order);
    if (shippedQty <= 0) return assemblyItem;

    const nextCount = Math.max(0, assemblyItem.collectedCount - shippedQty);
    if (nextCount === assemblyItem.collectedCount) return assemblyItem;

    return {
      ...assemblyItem,
      collectedCount: nextCount,
      collectedAt: Date.now(),
    };
  });
}

/** Возвращает собранные единицы после отмены отправки */
export function restoreAssemblyForOrder(
  assemblyItems: AssemblyItem[],
  order: ShippingOrder,
): AssemblyItem[] {
  return assemblyItems.map((assemblyItem) => {
    const shippedQty = shippedQtyForAssemblyItem(assemblyItem, order);
    if (shippedQty <= 0) return assemblyItem;

    const nextCount = Math.min(assemblyItem.quantity, assemblyItem.collectedCount + shippedQty);
    if (nextCount === assemblyItem.collectedCount) return assemblyItem;

    return {
      ...assemblyItem,
      collectedCount: nextCount,
      collectedAt: Date.now(),
    };
  });
}

/**
 * После отмены отправки снова показывает позиции в сборке.
 * Не восстанавливает «собрано» — заказ нужно собрать заново.
 */
export function ensureAssemblyItemsForOrder(
  assemblyItems: AssemblyItem[],
  order: ShippingOrder,
): AssemblyItem[] {
  if (order.barcodePrinted || order.items.length === 0) return assemblyItems;

  const isBlogger = orderIsBlogger(order);
  const byId = new Map(assemblyItems.map((item) => [item.id, item]));
  const next = [...assemblyItems];
  let changed = false;

  for (const line of order.items) {
    const id = assemblyItemIdFromOrderLine(order, line);
    if (byId.has(id)) continue;
    changed = true;
    const item: AssemblyItem = {
      id,
      productId: line.productId,
      productName: line.productName,
      size: line.size,
      sizeId: line.sizeId,
      brand: (line.brand || order.storeBrand || "CASHER").trim() || "CASHER",
      imageUrl: line.imageUrl,
      barcodeId: line.barcodeId || String(line.sizeId),
      quantity: line.quantity,
      collectedCount: 0,
      isBlogger,
    };
    byId.set(id, item);
    next.push(item);
  }

  return changed ? next : assemblyItems;
}

export function reconcileAssemblyOnShip(
  prevOrders: ShippingOrder[],
  nextOrders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): AssemblyItem[] {
  return reconcileAssemblyChanges(prevOrders, nextOrders, assemblyItems);
}

/** Списывает/восстанавливает сборку при ship/unship */
export function reconcileAssemblyChanges(
  prevOrders: ShippingOrder[],
  nextOrders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
): AssemblyItem[] {
  const prevShipped = new Map(
    prevOrders.filter((order) => order.barcodePrinted).map((order) => [order.id, order]),
  );
  let items = assemblyItems;

  for (const order of nextOrders) {
    if (order.barcodePrinted && !prevShipped.has(order.id)) {
      items = consumeAssemblyForOrder(items, order);
    }
  }

  for (const [orderId, prevOrder] of prevShipped) {
    const next = nextOrders.find((order) => order.id === orderId);
    if (next && !next.barcodePrinted) {
      // Позиции снова в очереди; «собрано» не возвращаем — собирать заново.
      items = ensureAssemblyItemsForOrder(items, next);
    }
  }

  return items;
}
