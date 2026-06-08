import type { ApiUnshippedOrder } from "@/types/orders-api";
import { ORDERS_API_BASE, casherAuthHeaders, getCasherApiKey } from "@/lib/server/casher-api";
import { assertPdfBuffer } from "@/lib/server/pdf-label-printer";

const UNSHIPPED_PATH = "/orders/admin/unshipped-with-stock";

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

  const res = await fetch(`${ORDERS_API_BASE}${UNSHIPPED_PATH}`, {
    headers: {
      ...casherAuthHeaders(),
      Accept: "application/json",
    },
    cache: "no-store",
  });

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

export async function downloadBarcodePdf(barcodeUrl: string): Promise<Buffer> {
  const key = getCasherApiKey();
  if (!key) {
    throw new Error("Не задан API-ключ для скачивания этикетки");
  }

  const res = await fetch(barcodeUrl, {
    headers: {
      ...casherAuthHeaders(),
      Accept: "application/pdf",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Не удалось скачать этикетку: HTTP ${res.status}`);
  }

  const data = Buffer.from(await res.arrayBuffer());
  assertPdfBuffer(data);
  return data;
}
