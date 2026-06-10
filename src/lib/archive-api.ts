import type { ShippingOrder } from "@/types/shipping";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

/** Сразу пишет отправленные заказы в shipped-archive.json на сервере */
export async function persistShippedOrders(orders: ShippingOrder[]): Promise<boolean> {
  const shipped = orders.filter((order) => order.barcodePrinted);
  if (shipped.length === 0) return true;

  try {
    const res = await fetchWithTimeout("/api/archive/ship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: shipped }),
      cache: "no-store",
      timeoutMs: 15_000,
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return res.ok && data.ok === true;
  } catch {
    return false;
  }
}
