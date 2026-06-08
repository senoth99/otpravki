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

/** TODO: заменить на реальный эндпоинт сборки */
export async function fetchAssemblyItems(): Promise<ApiProduct[]> {
  const products = await fetchProducts();
  return pickRandomProducts(products, 5);
}

/** TODO: заменить на реальный эндпоинт заказов на отправку */
export async function fetchShippingOrders(): Promise<ApiProduct[]> {
  const products = await fetchProducts();
  return pickRandomProducts(products, 10);
}

/** TODO: заменить на реальный эндпоинт баркода заказа */
export async function fetchOrderBarcode(orderId: string): Promise<string> {
  return orderId;
}

export function pickRandomProducts(products: ApiProduct[], count: number): ApiProduct[] {
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  const picked: ApiProduct[] = [];
  const usedIds = new Set<string>();

  for (const product of shuffled) {
    if (picked.length >= count) break;
    if (usedIds.has(product.id)) continue;
    const visibleSizes = product.sizes.filter((s) => s.isVisible && s.size !== "One Size");
    if (visibleSizes.length === 0) continue;
    usedIds.add(product.id);
    picked.push(product);
  }

  return picked;
}
