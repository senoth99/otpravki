import { NextResponse } from "next/server";
import {
  ORDERS_API_BASE,
  casherAuthHeaders,
  getBrandApiConfigs,
  getCasherApiKey,
} from "@/lib/server/casher-api";
import { probeExternalApi } from "@/lib/server/external-fetch";
import { getProductionBrandAuths } from "@/lib/server/production-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const brands = getBrandApiConfigs();
  const productionAuths = getProductionBrandAuths();
  const hasKey = brands.length > 0 || Boolean(getCasherApiKey());
  const sample = brands[0] ?? null;

  const products = sample
    ? await probeExternalApi(`${ORDERS_API_BASE}/products`, {
        ...casherAuthHeaders(sample.token),
        Accept: "application/json",
      })
    : await probeExternalApi(`${ORDERS_API_BASE}/products`);

  const queue = sample
    ? await probeExternalApi(`${ORDERS_API_BASE}/products/production`, {
        ...casherAuthHeaders(sample.token),
        Accept: "application/json",
      })
    : null;

  let orders: Awaited<ReturnType<typeof probeExternalApi>> | null = null;
  if (sample) {
    orders = await probeExternalApi(`${ORDERS_API_BASE}/orders/admin/unshipped-with-stock`, {
      ...casherAuthHeaders(sample.token),
      Accept: "application/json",
    });
  }

  const ok = products.ok && hasKey && orders?.ok === true;

  const timedOut =
    products.error?.includes("timeout") ||
    products.error?.includes("aborted") ||
    orders?.error?.includes("timeout") ||
    orders?.error?.includes("aborted");

  let hint = "Сервер видит API Amarix — заказы и товары доступны";
  if (timedOut) {
    hint =
      "Таймаут до api.amarix.ru — на сервере нет выхода в интернет или DNS. С сервера: curl -4 -I https://api.amarix.ru/products";
  } else if (!products.ok) {
    hint = "С Debian нет доступа к API — проверь интернет, DNS, файрвол";
  } else if (!hasKey) {
    hint =
      "Задай ORDERS_API_TOKEN_CASHER (и др. бренды) в ~/otpravki/.env и перезапусти: sudo systemctl restart otpravki";
  } else if (orders?.status === 401) {
    hint = "Неверный токен бренда (401) — проверь ORDERS_API_TOKEN_* в .env";
  } else if (orders && !orders.ok) {
    hint = `Заказы недоступны: HTTP ${orders.status ?? "error"}`;
  } else if (queue && !queue.ok) {
    hint = `Очередь производства недоступна: HTTP ${queue.status ?? "error"}`;
  }

  return NextResponse.json({
    ok,
    hasApiKey: hasKey,
    base: ORDERS_API_BASE,
    brands: brands.map((b) => b.label),
    productionModes: productionAuths.map((a) => ({
      brand: a.label,
      mode: a.facilityMode ? "production-api" : "products/production",
    })),
    products,
    productionQueue: queue,
    orders,
    hint,
  });
}
