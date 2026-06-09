import { NextResponse } from "next/server";
import { getCasherApiKey } from "@/lib/server/casher-api";
import { probeExternalApi } from "@/lib/server/external-fetch";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await probeExternalApi("https://api.cashercollection.com/products");
  const hasKey = Boolean(getCasherApiKey());

  let orders: Awaited<ReturnType<typeof probeExternalApi>> | null = null;
  if (hasKey) {
    orders = await probeExternalApi(
      "https://api.cashercollection.com/orders/admin/unshipped-with-stock",
    );
  }

  const ok = products.ok && (orders?.ok === true || orders?.status === 401);

  return NextResponse.json({
    ok,
    hasApiKey: hasKey,
    products,
    orders,
    hint: ok
      ? "Сервер видит API Casher"
      : "С Debian нет доступа к api.cashercollection.com — проверь интернет, DNS, файрвол (curl с сервера)",
  });
}
