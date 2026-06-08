import type { ApiUnshippedOrder } from "@/types/orders-api";
import { ORDERS_API_BASE, casherAuthHeaders, getCasherApiKey } from "@/lib/server/casher-api";

const UNSHIPPED_PATH = "/orders/admin/unshipped-with-stock";

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
    headers: casherAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Не удалось скачать этикетку: HTTP ${res.status}`);
  }

  const data = await res.arrayBuffer();
  return Buffer.from(data);
}
