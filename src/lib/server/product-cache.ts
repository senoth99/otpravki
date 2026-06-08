import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { ApiProduct } from "@/types/shipping";

const API_BASE = process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com";
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const CACHE_FILE = path.join(CACHE_DIR, "products.json");
const TTL_MS = Number(process.env.PRODUCTS_CACHE_TTL_MS ?? 5 * 60 * 1000);

interface CacheEntry {
  fetchedAt: number;
  data: ApiProduct[];
}

async function readCache(): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(data: ApiProduct[]) {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { fetchedAt: Date.now(), data };
  await writeFile(CACHE_FILE, JSON.stringify(entry), "utf-8");
}

function filterProducts(products: ApiProduct[]) {
  return products.filter((p) => !p.isDeleted && p.inStock && p.images.length > 0);
}

async function fetchRemote(): Promise<ApiProduct[]> {
  const res = await fetch(`${API_BASE}/products`, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Products API ${res.status}`);
  const data: ApiProduct[] = await res.json();
  return filterProducts(data);
}

export async function getProductsWithCache(): Promise<{
  products: ApiProduct[];
  source: "network" | "cache" | "stale-cache" | "empty";
}> {
  const cached = await readCache();
  const cacheFresh = cached && Date.now() - cached.fetchedAt < TTL_MS;

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
    return { products: [], source: "empty" };
  }
}
