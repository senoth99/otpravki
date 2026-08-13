export const EXTRA_BRANDS = ["CASHER", "SHECASH", "AMMO", "KURAZHDVIZH"] as const;
export type ExtraBrand = (typeof EXTRA_BRANDS)[number];

export interface AssemblyExtra {
  id: string;
  brand: string;
  name: string;
  applyTo: "all" | "products";
  productIds: string[];
}

export function extraAppliesToProduct(extra: AssemblyExtra, productId: string): boolean {
  if (extra.applyTo === "all") return true;
  return extra.productIds.includes(productId);
}

export function extrasForProductIds(
  extras: AssemblyExtra[],
  productIds: Iterable<string>,
): AssemblyExtra[] {
  const ids = new Set(productIds);
  return extras.filter((extra) => {
    if (extra.applyTo === "all") return true;
    return extra.productIds.some((id) => ids.has(id));
  });
}
