import { mergeShippedArchives, unionPermanentArchive } from "@/lib/shipped-archive";
import type { AssemblyItem, ShippingOrder, ShippingOrderItem } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

function brandLabel(value?: string): string {
  return value?.trim() || "CASHER";
}

function mergeAssemblyProgress(_prev: AssemblyItem, fresh: AssemblyItem): AssemblyItem {
  // Сборка восстанавливается только из session-progress, не из памяти/API.
  return fresh;
}

function mergeOrderItemProgress(_prev: ShippingOrderItem, fresh: ShippingOrderItem): ShippingOrderItem {
  // Сканы восстанавливаются только из session-progress, не из памяти/API.
  return fresh;
}

function mergeOrderProgress(prev: ShippingOrder, fresh: ShippingOrder): ShippingOrder {
  const prevItems = new Map(prev.items.map((item) => [item.id, item]));
  return {
    ...fresh,
    barcodePrinted: prev.barcodePrinted,
    barcodePrintedAt: prev.barcodePrintedAt,
    items: fresh.items.map((item) => {
      const old = prevItems.get(item.id);
      return old ? mergeOrderItemProgress(old, item) : item;
    }),
  };
}

/** Свежие данные с API + архив отправленных (никогда не очищается) */
export function mergeFreshOrdersData(
  existing: SharedWorkspaceState,
  fresh: {
    assemblyItems: AssemblyItem[];
    orders: ShippingOrder[];
    apiOrderIds?: string[];
  },
): SharedWorkspaceState {
  const archiveById = new Map(
    mergeShippedArchives(existing.shippedArchive ?? [], existing.orders).map((order) => [
      order.id,
      order,
    ]),
  );

  const existingOrders = new Map(existing.orders.map((order) => [order.id, order]));
  const existingAssembly = new Map(existing.assemblyItems.map((item) => [item.id, item]));
  const activeOrders: ShippingOrder[] = [];
  const freshIds = new Set(fresh.orders.map((order) => order.id));

  for (const order of fresh.orders) {
    const prev = existingOrders.get(order.id);
    if (prev && !prev.barcodePrinted) {
      archiveById.delete(order.id);
      activeOrders.push(mergeOrderProgress(prev, order));
      continue;
    }

    const archived = archiveById.get(order.id);
    if (!archived) {
      activeOrders.push(prev ? mergeOrderProgress(prev, order) : order);
      continue;
    }

    archiveById.delete(order.id);
    activeOrders.push(prev ? mergeOrderProgress(prev, order) : order);
  }

  for (const [id, prev] of existingOrders) {
    if (prev.barcodePrinted || freshIds.has(id)) continue;
    activeOrders.push(prev);
  }

  const shippedArchive = unionPermanentArchive(
    [...archiveById.values()],
    existing.shippedArchive ?? [],
  ).sort((a, b) => (b.barcodePrintedAt ?? 0) - (a.barcodePrintedAt ?? 0));

  const assemblyItems = fresh.assemblyItems.map((item) => {
    const prev = existingAssembly.get(item.id);
    return prev ? mergeAssemblyProgress(prev, item) : item;
  });

  return {
    ...existing,
    assemblyItems,
    orders: activeOrders,
    shippedArchive,
    apiOrderIds: fresh.apiOrderIds ?? fresh.orders.map((order) => order.id),
    updatedAt: Date.now(),
  };
}

/** Свежие данные одного бренда + остальные бренды из текущей сессии */
export function mergeFreshOrdersDataForBrand(
  existing: SharedWorkspaceState,
  brand: string,
  fresh: {
    assemblyItems: AssemblyItem[];
    orders: ShippingOrder[];
    apiOrderIds?: string[];
  },
): SharedWorkspaceState {
  const brandNorm = brand.trim();
  const matchesOrder = (order: ShippingOrder) => brandLabel(order.storeBrand) === brandNorm;
  const matchesAssembly = (item: AssemblyItem) => brandLabel(item.brand) === brandNorm;
  const brandPrefix = `${brandNorm.toLowerCase()}:`;

  const brandExisting: SharedWorkspaceState = {
    ...existing,
    orders: existing.orders.filter(matchesOrder),
    assemblyItems: existing.assemblyItems.filter(matchesAssembly),
    apiOrderIds: (existing.apiOrderIds ?? []).filter((id) => id.startsWith(brandPrefix)),
  };

  const brandMerged = mergeFreshOrdersData(brandExisting, fresh);

  return {
    ...brandMerged,
    orders: [
      ...existing.orders.filter((order) => !matchesOrder(order)),
      ...brandMerged.orders,
    ],
    assemblyItems: [
      ...existing.assemblyItems.filter((item) => !matchesAssembly(item)),
      ...brandMerged.assemblyItems,
    ],
    apiOrderIds: [
      ...(existing.apiOrderIds ?? []).filter((id) => !id.startsWith(brandPrefix)),
      ...(brandMerged.apiOrderIds ?? []),
    ],
  };
}
