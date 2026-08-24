import type { ApiProduct } from "@/types/shipping";
import { getImageUrl, toLocalImageUrl } from "@/lib/image-url";
import { getProductsWithCache } from "@/lib/server/product-cache";

export const API_BASE = process.env.PRODUCTS_API_URL ?? "https://api.amarix.ru";

export { getImageUrl, toLocalImageUrl };

export async function fetchProducts(): Promise<ApiProduct[]> {
  const { products } = await getProductsWithCache();
  return products;
}
