import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import {
  ORDERS_API_BASE,
  casherAuthHeaders,
  getBrandApiConfigs,
  type BrandApiConfig,
} from "@/lib/server/casher-api";
import { externalFetch } from "@/lib/server/external-fetch";
import type {
  ProductionCatalogProduct,
  ProductionQueueItem,
  ProductionReceiveLine,
  ProductionReceiveLineResult,
  ProductionReceiveResult,
} from "@/types/production-api";
import type { ApiProduct, ProductSize } from "@/types/shipping";

/**
 * Amarix production API.
 *
 * Facility keys (hex): `/production-api/queue|receive|products`
 * Admin brand tokens (csh_at_…): `/products/production` (GET queue, POST receive)
 * и каталог `/products` по каждому бренду.
 */

function sanitizeApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  return trimmed || undefined;
}

export interface ProductionBrandAuth extends BrandApiConfig {
  /** true → ходить в /production-api/* */
  facilityMode: boolean;
}

/** Ключ площадки PRODUCTION_API_TOKEN_* или fallback ORDERS_API_TOKEN_*. */
export function getProductionBrandAuths(): ProductionBrandAuth[] {
  const env = process.env as Record<string, string | undefined>;
  const brands = getBrandApiConfigs();
  return brands.map((brand) => {
    const facility =
      sanitizeApiKey(env[`PRODUCTION_API_TOKEN_${brand.key}`]) ??
      sanitizeApiKey(env[`PRODUCTION_API_KEY_${brand.key}`]);
    if (facility) {
      return { ...brand, token: facility, facilityMode: true };
    }
    return { ...brand, facilityMode: false };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asBool(value: unknown): boolean {
  return value === true;
}

function queuePath(auth: ProductionBrandAuth): string {
  return auth.facilityMode
    ? `${ORDERS_API_BASE}/production-api/queue`
    : `${ORDERS_API_BASE}/products/production`;
}

function receivePath(auth: ProductionBrandAuth): string {
  return auth.facilityMode
    ? `${ORDERS_API_BASE}/production-api/receive`
    : `${ORDERS_API_BASE}/products/production`;
}

function productsPath(auth: ProductionBrandAuth, all = true): string {
  if (auth.facilityMode) {
    const q = all ? "?all=1" : "";
    return `${ORDERS_API_BASE}/production-api/products${q}`;
  }
  return `${ORDERS_API_BASE}/products`;
}

function mapQueueItem(row: unknown, storeBrand: string): ProductionQueueItem | null {
  const rec = asRecord(row);
  if (!rec) return null;
  const productId = asFiniteNumber(rec.product_id);
  if (productId == null) return null;
  const qty =
    asFiniteNumber(rec.quantity_to_produce) ?? asFiniteNumber(rec.quantity) ?? 0;
  return {
    product_id: productId,
    product_name: asText(rec.product_name) || `Товар ${productId}`,
    product_slug: asText(rec.product_slug) || null,
    brand_code: asText(rec.brand_code) || undefined,
    storeBrand,
    chestny_znak:
      typeof rec.chestny_znak === "string"
        ? rec.chestny_znak
        : rec.chestny_znak == null
          ? null
          : String(rec.chestny_znak),
    size: asText(rec.size) || "—",
    quantity_to_produce: qty,
    batch_size: asFiniteNumber(rec.batch_size) ?? 0,
    stock: asFiniteNumber(rec.stock) ?? 0,
    threshold: asFiniteNumber(rec.threshold) ?? 0,
    on_demand: asBool(rec.on_demand),
    link_only: asBool(rec.link_only),
  };
}

async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  let res: Response;
  try {
    res = await externalFetch(url, {
      ...init,
      cache: "no-store",
      timeoutMs: init.timeoutMs ?? 25_000,
    });
  } catch (error) {
    throw new Error(formatApiFetchError(error, url));
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function fetchProductionQueueForBrand(
  auth: ProductionBrandAuth,
): Promise<ProductionQueueItem[]> {
  const url = queuePath(auth);
  const { ok, status, data } = await fetchJson(url, {
    headers: { ...casherAuthHeaders(auth.token), Accept: "application/json" },
  });
  if (!ok) {
    const err = asRecord(data)?.error;
    throw new Error(
      typeof err === "string"
        ? `${auth.label}: ${err}`
        : `${auth.label}: очередь производства HTTP ${status}`,
    );
  }

  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.items)
      ? (asRecord(data)!.items as unknown[])
      : [];

  return rows
    .map((row) => mapQueueItem(row, auth.label))
    .filter((row): row is ProductionQueueItem => row != null);
}

export async function fetchProductionQueue(brand?: string): Promise<ProductionQueueItem[]> {
  const auths = getProductionBrandAuths();
  if (auths.length === 0) {
    throw new Error("Нет токенов брендов (ORDERS_API_TOKEN_* / PRODUCTION_API_TOKEN_*)");
  }

  const selected = brand
    ? auths.filter(
        (a) =>
          a.label.toLowerCase() === brand.trim().toLowerCase() ||
          a.code === brand.trim().toLowerCase() ||
          a.key === brand.trim().toUpperCase(),
      )
    : auths;

  if (selected.length === 0) {
    throw new Error(`Бренд «${brand}» не настроен`);
  }

  const chunks = await Promise.all(
    selected.map(async (auth) => {
      try {
        return await fetchProductionQueueForBrand(auth);
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }),
  );

  return chunks
    .flat()
    .filter((item) => item.quantity_to_produce > 0)
    .sort((a, b) => {
      if (a.on_demand !== b.on_demand) return a.on_demand ? -1 : 1;
      return b.quantity_to_produce - a.quantity_to_produce;
    });
}

function mapReceiveLineResult(row: unknown): ProductionReceiveLineResult | null {
  const rec = asRecord(row);
  if (!rec) return null;
  const productId = asFiniteNumber(rec.product_id);
  if (productId == null) return null;
  return {
    product_id: productId,
    size: asText(rec.size),
    received_quantity: asFiniteNumber(rec.received_quantity) ?? 0,
    stock: asFiniteNumber(rec.stock) ?? 0,
    quantity: asFiniteNumber(rec.quantity) ?? 0,
    warehouse_slug: asText(rec.warehouse_slug) || undefined,
    warehouse_id: asFiniteNumber(rec.warehouse_id) ?? undefined,
    product_name: asText(rec.product_name) || undefined,
  };
}

export async function receiveProductionForBrand(
  auth: ProductionBrandAuth,
  lines: ProductionReceiveLine[],
): Promise<ProductionReceiveResult> {
  if (lines.length === 0) {
    throw new Error("Нет строк для прихода");
  }

  const body =
    lines.length === 1
      ? {
          product_id: lines[0].product_id,
          size: lines[0].size,
          quantity: lines[0].quantity,
          ...(lines[0].warehouse_slug ? { warehouse_slug: lines[0].warehouse_slug } : {}),
        }
      : {
          lines: lines.map((line) => ({
            product_id: line.product_id,
            size: line.size,
            quantity: line.quantity,
            ...(line.warehouse_slug ? { warehouse_slug: line.warehouse_slug } : {}),
          })),
        };

  const url = receivePath(auth);
  const { ok, status, data } = await fetchJson(url, {
    method: "POST",
    headers: {
      ...casherAuthHeaders(auth.token),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });

  if (!ok) {
    const err = asRecord(data)?.error;
    throw new Error(
      typeof err === "string"
        ? `${auth.label}: ${err}`
        : `${auth.label}: приход HTTP ${status}`,
    );
  }

  const rec = asRecord(data) ?? {};
  const nested = Array.isArray(rec.lines) ? rec.lines : null;
  const linesOut = nested
    ? nested.map(mapReceiveLineResult).filter((x): x is ProductionReceiveLineResult => x != null)
    : [mapReceiveLineResult(data)].filter((x): x is ProductionReceiveLineResult => x != null);

  return {
    ok: rec.ok !== false,
    queue_count: asFiniteNumber(rec.queue_count) ?? undefined,
    warehouse_slug: asText(rec.warehouse_slug) || undefined,
    warehouse_id: asFiniteNumber(rec.warehouse_id) ?? undefined,
    lines: linesOut,
  };
}

export async function receiveProduction(
  storeBrand: string,
  lines: ProductionReceiveLine[],
): Promise<ProductionReceiveResult> {
  const auth = getProductionBrandAuths().find(
    (a) =>
      a.label.toLowerCase() === storeBrand.trim().toLowerCase() ||
      a.code === storeBrand.trim().toLowerCase() ||
      a.key === storeBrand.trim().toUpperCase(),
  );
  if (!auth) {
    throw new Error(`Бренд «${storeBrand}» не настроен для производства`);
  }
  return receiveProductionForBrand(auth, lines);
}

function mapFacilityProduct(row: unknown, fallbackBrand: string): ApiProduct | null {
  const rec = asRecord(row);
  if (!rec) return null;
  const productId = asFiniteNumber(rec.product_id);
  if (productId == null) return null;
  const images = Array.isArray(rec.images)
    ? rec.images.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const sizesRaw = Array.isArray(rec.sizes) ? rec.sizes : [];
  const sizes: ProductSize[] = sizesRaw
    .map((sizeRow) => {
      const s = asRecord(sizeRow);
      if (!s) return null;
      const sizeId = asFiniteNumber(s.size_id);
      const size = asText(s.size);
      if (sizeId == null || !size) return null;
      const qty =
        asFiniteNumber(s.stock_available) ?? asFiniteNumber(s.stock) ?? 0;
      return {
        id: sizeId,
        size,
        quantity: qty,
        isVisible: s.visible !== false,
      } satisfies ProductSize;
    })
    .filter((x): x is ProductSize => x != null);

  return {
    id: String(productId),
    name: asText(rec.product_name) || `Товар ${productId}`,
    slug: asText(rec.product_slug) || `product-${productId}`,
    images,
    brand: asText(rec.brand_code) || fallbackBrand,
    sizes,
    inStock: sizes.some((s) => s.quantity > 0),
    isDeleted: false,
  };
}

function mapAdminProduct(row: unknown, fallbackBrand: string): ApiProduct | null {
  const rec = asRecord(row);
  if (!rec) return null;
  const id = asText(rec.id) || String(asFiniteNumber(rec.id) ?? "");
  if (!id) return null;
  const images = Array.isArray(rec.images)
    ? rec.images.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const sizesRaw = Array.isArray(rec.sizes) ? rec.sizes : [];
  const sizes: ProductSize[] = sizesRaw
    .map((sizeRow) => {
      const s = asRecord(sizeRow);
      if (!s) return null;
      const sizeId = asFiniteNumber(s.id);
      const size = asText(s.size);
      if (sizeId == null || !size) return null;
      return {
        id: sizeId,
        size,
        quantity:
          asFiniteNumber(s.availableQuantity) ??
          asFiniteNumber(s.quantity) ??
          0,
        isVisible: s.isVisible !== false,
      } satisfies ProductSize;
    })
    .filter((x): x is ProductSize => x != null);

  return {
    id,
    name: asText(rec.name) || `Товар ${id}`,
    slug: asText(rec.slug) || `product-${id}`,
    images,
    brand: asText(rec.brand) || fallbackBrand,
    sizes,
    inStock: rec.inStock === true || sizes.some((s) => s.quantity > 0),
    isDeleted: rec.isDeleted === true,
  };
}

export async function fetchProductsForBrand(auth: ProductionBrandAuth): Promise<ApiProduct[]> {
  const url = productsPath(auth, true);
  const { ok, status, data } = await fetchJson(url, {
    headers: { ...casherAuthHeaders(auth.token), Accept: "application/json" },
    timeoutMs: 30_000,
  });
  if (!ok) {
    const err = asRecord(data)?.error;
    throw new Error(
      typeof err === "string"
        ? `${auth.label} products: ${err}`
        : `${auth.label} products HTTP ${status}`,
    );
  }

  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.items)
      ? (asRecord(data)!.items as unknown[])
      : [];

  const mapper = auth.facilityMode ? mapFacilityProduct : mapAdminProduct;
  return rows
    .map((row) => mapper(row, auth.code))
    .filter((p): p is ApiProduct => p != null && !p.isDeleted);
}

/** Каталог всех брендов: один ключ = один бренд (как в доке Amarix). */
export async function fetchAllBrandProducts(): Promise<ApiProduct[]> {
  const auths = getProductionBrandAuths();
  if (auths.length === 0) return [];

  const chunks = await Promise.all(
    auths.map(async (auth) => {
      try {
        return await fetchProductsForBrand(auth);
      } catch {
        return [] as ApiProduct[];
      }
    }),
  );

  const byId = new Map<string, ApiProduct>();
  for (const product of chunks.flat()) {
    const key = `${product.brand.toLowerCase()}:${product.id}`;
    const prev = byId.get(key);
    if (!prev || (product.images.length > 0 && prev.images.length === 0)) {
      byId.set(key, product);
    }
  }
  return [...byId.values()];
}

/** Сырой facility-каталог (если нужен UI производства). */
export async function fetchProductionCatalogRaw(
  auth: ProductionBrandAuth,
): Promise<ProductionCatalogProduct[]> {
  if (!auth.facilityMode) return [];
  const url = productsPath(auth, true);
  const { ok, data } = await fetchJson(url, {
    headers: { ...casherAuthHeaders(auth.token), Accept: "application/json" },
  });
  if (!ok) return [];
  const rows = Array.isArray(asRecord(data)?.items) ? (asRecord(data)!.items as unknown[]) : [];
  const out: ProductionCatalogProduct[] = [];
  for (const row of rows) {
    const rec = asRecord(row);
    if (!rec) continue;
    const productId = asFiniteNumber(rec.product_id);
    if (productId == null) continue;
    out.push({
      product_id: productId,
      product_name: asText(rec.product_name),
      product_slug: asText(rec.product_slug) || null,
      brand_code: asText(rec.brand_code) || auth.code,
      images: Array.isArray(rec.images)
        ? rec.images.filter((x): x is string => typeof x === "string")
        : [],
      sizes: [],
    });
  }
  return out;
}
