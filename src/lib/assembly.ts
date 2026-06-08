import type { ApiProduct, AssemblyItem } from "@/types/shipping";
import { getImageUrl } from "@/lib/api";
import { formatSize } from "@/lib/format";

const SIZES = ["XS", "S", "M", "L", "XL"];

export interface AssemblyLine {
  product: ApiProduct;
  sizeIndex?: number;
  quantity?: number;
}

function assemblyKey(productId: string, sizeId: number) {
  return `${productId}-${sizeId}`;
}

export function buildAssemblyItems(lines: AssemblyLine[]): AssemblyItem[] {
  const grouped = new Map<string, AssemblyItem>();

  lines.forEach((line, index) => {
    const { product, sizeIndex = index, quantity = 1 } = line;
    const visibleSizes = product.sizes.filter((s) => s.isVisible && s.size !== "One Size");
    const size = visibleSizes[sizeIndex % visibleSizes.length] ?? visibleSizes[0];
    const fallbackSize = SIZES[sizeIndex % SIZES.length];
    const sizeId = size?.id ?? 1000 + index;
    const key = assemblyKey(product.id, sizeId);

    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += quantity;
      return;
    }

    grouped.set(key, {
      id: `assembly-${key}`,
      productId: product.id,
      productName: product.name,
      size: formatSize(size?.size ?? fallbackSize),
      sizeId,
      brand: product.brand || "CASHER",
      imageUrl: getImageUrl(product.images[0]),
      barcodeId: String(sizeId),
      quantity,
      collectedCount: 0,
    });
  });

  return Array.from(grouped.values());
}

export function buildAssemblyItemsFromProducts(products: ApiProduct[]): AssemblyItem[] {
  const lines: AssemblyLine[] = products.map((product, index) => ({
    product,
    sizeIndex: index,
    quantity: index === 0 ? 3 : index === 2 ? 2 : 1,
  }));

  return buildAssemblyItems(lines);
}
