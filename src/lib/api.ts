import type { ApiProduct } from "@/types/shipping";
import { getProductsWithCache } from "@/lib/server/product-cache";

export const API_BASE = process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com";

export function getImageUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

export async function fetchProducts(): Promise<ApiProduct[]> {
  const { products } = await getProductsWithCache();
  return products;
}
