import type { ShippingOrder } from "@/types/shipping";
import type { WorkspaceState } from "@/types/workspace";
import { mutatingApiHeaders } from "@/lib/api-headers";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

/** Сохраняет прогресс сборки и сканов на сервере */
export async function persistSessionProgress(workspace: WorkspaceState): Promise<void> {
  try {
    await fetchWithTimeout("/api/session/progress", {
      method: "POST",
      headers: mutatingApiHeaders(),
      body: JSON.stringify({ workspace }),
      cache: "no-store",
      timeoutMs: 10_000,
    });
  } catch {
    // не блокируем UI
  }
}

/** Сразу пишет отправленные заказы в shipped-archive.json на сервере */
export async function persistShippedOrders(orders: ShippingOrder[]): Promise<boolean> {
  const shipped = orders.filter((order) => order.barcodePrinted);
  if (shipped.length === 0) return true;

  try {
    const res = await fetchWithTimeout("/api/archive/ship", {
      method: "POST",
      headers: mutatingApiHeaders(),
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
