import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import { formatSize } from "@/lib/format";

export interface MissingAssemblyItem {
  productName: string;
  size: string;
  need: number;
  have: number;
}

export function getOrderAssemblyStatus(order: ShippingOrder, assemblyItems: AssemblyItem[]) {
  const pool = new Map(
    assemblyItems.map((item) => [`${item.productId}-${item.sizeId}`, item.collectedCount]),
  );

  const missing: MissingAssemblyItem[] = [];

  for (const item of order.items) {
    const key = `${item.productId}-${item.sizeId}`;
    const have = pool.get(key) ?? 0;
    const need = item.quantity;

    if (have < need) {
      missing.push({
        productName: item.productName,
        size: formatSize(item.size),
        need,
        have,
      });
    }
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}
