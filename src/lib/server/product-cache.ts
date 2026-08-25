import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fetchAllBrandProducts } from "@/lib/server/production-api";
import type { ApiProduct } from "@/types/shipping";
import { getMockProducts } from "@/lib/mock-products";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const CACHE_FILE = path.join(CACHE_DIR, "products.json");
const TTL_MS = Number(process.env.PRODUCTS_CACHE_TTL_MS ?? 5 * 60 * 1000);

interface CacheEntry {
  fetchedAt: number;
  data: ApiProduct[];
}

let memory: CacheEntry | null = null;

async function readCache(): Promise<CacheEntry | null> {
  if (memory) return memory;
  try {
    const raw = await readFile(CACHE_FILE, "utf-8");
    memory = JSON.parse(raw) as CacheEntry;
    return memory;
  } catch {
    return null;
  }
}

async function writeCache(data: ApiProduct[]) {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { fetchedAt: Date.now(), data };
  memory = entry;
  await writeFile(CACHE_FILE, JSON.stringify(entry), "utf-8");
}

async function fetchRemote(): Promise<ApiProduct[]> {
  // По доке Amarix: один ключ = один бренд. Тянем /products (или production-api/products)
  // по каждому ORDERS_API_TOKEN_* / PRODUCTION_API_TOKEN_* и склеиваем.
  const filtered = await fetchAllBrandProducts();
  return filtered.length > 0 ? filtered : getMockProducts();
}

export async function refreshProductsCache(): Promise<ApiProduct[]> {
  const products = await fetchRemote();
  await writeCache(products);
  return products;
}

export async function rememberProductsCache(products: ApiProduct[]): Promise<void> {
  if (products.length === 0) return;
  await writeCache(products);
}

/** Только диск — без повторного запроса в сеть */
export async function getStaleProductsFromCache(): Promise<ApiProduct[]> {
  const cached = await readCache();
  return cached?.data ?? [];
}

export async function getProductsWithCache(): Promise<{
  products: ApiProduct[];
  source: "network" | "cache" | "stale-cache" | "empty";
}> {
  const cached = await readCache();
  const cacheFresh = cached && cached.data.length > 0 && Date.now() - cached.fetchedAt < TTL_MS;

  if (cacheFresh) {
    return { products: cached.data, source: "cache" };
  }

  try {
    const products = await fetchRemote();
    await writeCache(products);
    return { products, source: "network" };
  } catch {
    if (cached) {
      return { products: cached.data, source: "stale-cache" };
    }
    return { products: getMockProducts(), source: "empty" };
  }
}
