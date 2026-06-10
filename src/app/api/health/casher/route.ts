import { NextResponse } from "next/server";
import { ORDERS_API_BASE, casherAuthHeaders, getCasherApiKey } from "@/lib/server/casher-api";
import { probeExternalApi } from "@/lib/server/external-fetch";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await probeExternalApi(`${ORDERS_API_BASE}/products`);
  const hasKey = Boolean(getCasherApiKey());

  let orders: Awaited<ReturnType<typeof probeExternalApi>> | null = null;
  if (hasKey) {
    orders = await probeExternalApi(`${ORDERS_API_BASE}/orders/admin/unshipped-with-stock`, {
      ...casherAuthHeaders(),
      Accept: "application/json",
    });
  }

  const ok = products.ok && hasKey && orders?.ok === true;

  let hint = "Сервер видит API Casher — заказы и товары доступны";
  if (!products.ok) {
    hint = "С Debian нет доступа к API — проверь интернет, DNS, файрвол";
  } else if (!hasKey) {
    hint = "Задай CASHER_API_KEY в ~/otpravki/.env и перезапусти: sudo systemctl restart otpravki";
  } else if (orders?.status === 401) {
    hint = "Неверный CASHER_API_KEY (401) — нужен админский Bearer csh_at_...";
  } else if (orders && !orders.ok) {
    hint = `Заказы недоступны: HTTP ${orders.status ?? "error"}`;
  }

  return NextResponse.json({
    ok,
    hasApiKey: hasKey,
    products,
    orders,
    hint,
  });
}
