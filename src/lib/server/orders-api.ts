import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  isStockGatedLine,
  parseUnshippedOrdersPayload,
  type ApiOrderLineItem,
  type ApiUnshippedOrder,
} from "@/types/orders-api";
import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import {
  ORDERS_API_BASE,
  casherAuthHeaders,
  getBrandApiConfig,
  getBrandApiConfigs,
  getCasherApiKey,
  type BrandApiConfig,
} from "@/lib/server/casher-api";
import { externalFetch } from "@/lib/server/external-fetch";
import { assertPdfBuffer } from "@/lib/server/pdf-label-printer";

const UNSHIPPED_PATH = "/orders/admin/unshipped-with-stock";
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PDF_CACHE_DIR = path.join(DATA_DIR, "print", "pdfs");

export interface ApiUnshippedOrderWithBrand extends ApiUnshippedOrder {
  storeBrand: string;
  remoteOrderId: string;
}

function barcodePdfCachePath(orderId: string): string {
  return path.join(PDF_CACHE_DIR, `${orderId}.pdf`);
}

async function readCachedBarcodePdf(orderId: string): Promise<Buffer | null> {
  try {
    const data = await readFile(barcodePdfCachePath(orderId));
    assertPdfBuffer(data);
    return data;
  } catch {
    return null;
  }
}

async function cacheBarcodePdf(orderId: string, pdf: Buffer): Promise<void> {
  await mkdir(PDF_CACHE_DIR, { recursive: true });
  await writeFile(barcodePdfCachePath(orderId), pdf);
}

export function buildBarcodePdfUrl(orderId: string | number, brand?: string): string {
  void brand;
  return `${ORDERS_API_BASE}/orders/admin/order/${orderId}/cdek-barcode-pdf`;
}

export function resolveBarcodeUrl(orderId?: string, barcodeUrl?: string, brand?: string): string | null {
  const trimmed = barcodeUrl?.trim();
  if (trimmed) return trimmed;
  if (orderId) return buildBarcodePdfUrl(orderId, brand);
  return null;
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

function mapFullOrderLine(row: unknown): ApiOrderLineItem | null {
  const rec = asRecord(row);
  if (!rec) return null;
  const id = asFiniteNumber(rec.id);
  if (id == null) return null;

  const product = asRecord(rec.product) ?? {};
  const sizeObj = asRecord(rec.size);
  const size = asText(sizeObj?.size ?? rec.size);
  const warehouseQuantity = asFiniteNumber(rec.warehouseQuantity);
  const sizeId = asFiniteNumber(rec.sizeId) ?? asFiniteNumber(sizeObj?.id) ?? undefined;
  const images = Array.isArray(product.images) ? product.images : [];
  const imagePath = typeof images[0] === "string" ? images[0] : undefined;
  const chestnyZnak =
    typeof product.chestnyZnak === "string"
      ? product.chestnyZnak
      : typeof rec.chestnyZnak === "string"
        ? rec.chestnyZnak
        : null;

  return {
    id,
    productName: asText(product.name) || "Позиция",
    productSlug: asText(product.slug) || `product-${asFiniteNumber(rec.productId) ?? id}`,
    size: size || "—",
    quantity: asFiniteNumber(rec.quantity) ?? 1,
    price: asFiniteNumber(rec.price) ?? 0,
    warehouseQuantity,
    inStockAtWarehouse: warehouseQuantity == null ? true : warehouseQuantity > 0,
    chestnyZnak,
    sizeId,
    imagePath,
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * unshipped-with-stock не отдаёт позиции без складского учёта (гифты).
 * Добираем их из GET /orders/admin/order/:id.
 */
async function hydrateMissingOrderItems(
  order: ApiUnshippedOrderWithBrand,
  brand: BrandApiConfig,
): Promise<ApiUnshippedOrderWithBrand> {
  try {
    const res = await externalFetch(
      `${ORDERS_API_BASE}/orders/admin/order/${encodeURIComponent(order.remoteOrderId)}`,
      {
        headers: {
          ...casherAuthHeaders(brand.token),
          Accept: "application/json",
        },
        timeoutMs: 8_000,
      },
    );
    if (!res.ok) return order;

    const payload: unknown = await res.json();
    const rec = asRecord(payload);
    if (!Array.isArray(rec?.items)) return order;

    const have = new Set(order.items.map((item) => item.id));
    const extra: ApiOrderLineItem[] = [];
    for (const row of rec.items) {
      const mapped = mapFullOrderLine(row);
      if (!mapped || have.has(mapped.id)) continue;
      if (isStockGatedLine(mapped) && !mapped.inStockAtWarehouse) continue;
      extra.push(mapped);
    }
    if (extra.length === 0) return order;
    return { ...order, items: [...order.items, ...extra] };
  } catch {
    return order;
  }
}

async function fetchBrandUnshippedOrders(brand: BrandApiConfig): Promise<ApiUnshippedOrderWithBrand[]> {
  const ordersUrl = `${ORDERS_API_BASE}${UNSHIPPED_PATH}`;
  let res: Response;
  try {
    res = await externalFetch(ordersUrl, {
      headers: {
        ...casherAuthHeaders(brand.token),
        Accept: "application/json",
      },
      timeoutMs: 25_000,
    });
  } catch (error) {
    throw new Error(`${brand.label}: ${formatApiFetchError(error, ordersUrl)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        `${brand.label}: неверный API-ключ (401). Проверь токен бренда в .env и перезапусти сервер`,
      );
    }
    throw new Error(
      `${brand.label}: API заказов ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }

  const data: unknown = await res.json();
  const orders = parseUnshippedOrdersPayload(data).map((order) => ({
    ...order,
    id: Number.parseInt(`${order.id}`, 10),
    remoteOrderId: String(order.id),
    storeBrand: brand.label,
  }));
  return mapLimit(orders, 8, (order) => hydrateMissingOrderItems(order, brand));
}

export async function fetchUnshippedOrdersForBrand(
  brandCodeOrLabel: string,
): Promise<ApiUnshippedOrderWithBrand[]> {
  const config = getBrandApiConfig(brandCodeOrLabel);
  if (!config) {
    throw new Error(
      `Бренд «${brandCodeOrLabel}» не настроен — проверь ORDERS_API_TOKEN_* в .env`,
    );
  }
  return fetchBrandUnshippedOrders(config);
}

export async function fetchUnshippedOrders(): Promise<ApiUnshippedOrderWithBrand[]> {
  const brands = getBrandApiConfigs();
  const fallback = getCasherApiKey();
  if (brands.length === 0 && !fallback) {
    throw new Error("Не заданы токены брендов (ORDERS_API_TOKEN_CASHER/... ) в .env");
  }

  if (brands.length === 0 && fallback) {
    const singleBrand: BrandApiConfig = {
      key: "CASHER",
      code: "casher",
      label: "CASHER",
      token: fallback,
    };
    return fetchBrandUnshippedOrders(singleBrand);
  }

  const results = await Promise.allSettled(
    brands.map((brand) => fetchBrandUnshippedOrders(brand)),
  );
  const orders = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const errors = results.flatMap((result, index) => {
    if (result.status !== "rejected") return [];
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return [`${brands[index].label}: ${reason}`];
  });
  if (orders.length === 0 && errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return orders;
}

/** PUT /orders/{id}/status — перед печатью этикетки */
export async function markOrderShipped(orderId: string, brand?: string): Promise<void> {
  const config = getBrandApiConfig(brand);
  const key = config?.token ?? getCasherApiKey();
  if (!key) {
    throw new Error("Не задан API-ключ бренда для смены статуса");
  }

  const res = await externalFetch(
    `${ORDERS_API_BASE}/orders/${encodeURIComponent(orderId)}/status`,
    {
      method: "PUT",
      headers: {
        ...casherAuthHeaders(key),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ status: "shipped" }),
      timeoutMs: 25_000,
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Не удалось отметить заказ отправленным: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
}

export async function downloadBarcodePdf(
  barcodeUrl: string,
  orderId?: string,
  brand?: string,
): Promise<Buffer> {
  const key = getBrandApiConfig(brand)?.token ?? getCasherApiKey();
  if (!key) {
    throw new Error("Не задан API-ключ для скачивания этикетки");
  }

  try {
    const res = await externalFetch(barcodeUrl, {
      headers: {
        ...casherAuthHeaders(key),
        Accept: "application/pdf",
      },
      timeoutMs: 30_000,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Не удалось скачать этикетку: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}${brand ? ` (${brand})` : ""}`,
      );
    }

    const data = Buffer.from(await res.arrayBuffer());
    assertPdfBuffer(data);
    if (orderId) await cacheBarcodePdf(orderId, data);
    return data;
  } catch (error) {
    if (orderId) {
      const cached = await readCachedBarcodePdf(orderId);
      if (cached) return cached;
    }
    throw new Error(formatApiFetchError(error, barcodeUrl, "print"));
  }
}
