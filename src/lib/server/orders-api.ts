import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { ApiUnshippedOrder } from "@/types/orders-api";
import { parseUnshippedOrdersPayload } from "@/types/orders-api";
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
  return parseUnshippedOrdersPayload(data).map((order) => ({
    ...order,
    id: Number.parseInt(`${order.id}`, 10),
    remoteOrderId: String(order.id),
    storeBrand: brand.label,
  }));
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

  const chunks = await Promise.all(brands.map((brand) => fetchBrandUnshippedOrders(brand)));
  return chunks.flat();
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
      throw new Error(`Не удалось скачать этикетку: HTTP ${res.status}`);
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
