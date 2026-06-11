import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { ApiUnshippedOrder } from "@/types/orders-api";
import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import { ORDERS_API_BASE, casherAuthHeaders, getCasherApiKey } from "@/lib/server/casher-api";
import { externalFetch } from "@/lib/server/external-fetch";
import { assertPdfBuffer } from "@/lib/server/pdf-label-printer";

const UNSHIPPED_PATH = "/orders/admin/unshipped-with-stock";
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PDF_CACHE_DIR = path.join(DATA_DIR, "print", "pdfs");

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

export function buildBarcodePdfUrl(orderId: string | number): string {
  return `${ORDERS_API_BASE}/orders/admin/order/${orderId}/cdek-barcode-pdf`;
}

export function resolveBarcodeUrl(orderId?: string, barcodeUrl?: string): string | null {
  const trimmed = barcodeUrl?.trim();
  if (trimmed) return trimmed;
  if (orderId) return buildBarcodePdfUrl(orderId);
  return null;
}

export async function fetchUnshippedOrders(): Promise<ApiUnshippedOrder[]> {
  const key = getCasherApiKey();
  if (!key) {
    throw new Error("Не задан API-ключ (api или CASHER_API_KEY в .env)");
  }

  const ordersUrl = `${ORDERS_API_BASE}${UNSHIPPED_PATH}`;
  let res: Response;
  try {
    res = await externalFetch(ordersUrl, {
      headers: {
        ...casherAuthHeaders(),
        Accept: "application/json",
      },
      timeoutMs: 25_000,
    });
  } catch (error) {
    throw new Error(formatApiFetchError(error, ordersUrl));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        "Неверный API-ключ (401). Проверь CASHER_API_KEY в .env и перезапусти: sudo systemctl restart otpravki",
      );
    }
    throw new Error(`API заказов: ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }

  return (await res.json()) as ApiUnshippedOrder[];
}

/** PUT /orders/{id}/status — перед печатью этикетки */
export async function markOrderShipped(orderId: string): Promise<void> {
  const key = getCasherApiKey();
  if (!key) {
    throw new Error("Не задан API-ключ (api или CASHER_API_KEY в .env)");
  }

  const res = await externalFetch(
    `${ORDERS_API_BASE}/orders/${encodeURIComponent(orderId)}/status`,
    {
      method: "PUT",
      headers: {
        ...casherAuthHeaders(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ status: "shipped" }),
      timeoutMs: 25_000,
    },
  );

  if (res.status !== 200) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Не удалось отметить заказ отправленным: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
}

export async function downloadBarcodePdf(
  barcodeUrl: string,
  orderId?: string,
): Promise<Buffer> {
  const key = getCasherApiKey();
  if (!key) {
    throw new Error("Не задан API-ключ для скачивания этикетки");
  }

  try {
    const res = await externalFetch(barcodeUrl, {
      headers: {
        ...casherAuthHeaders(),
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
