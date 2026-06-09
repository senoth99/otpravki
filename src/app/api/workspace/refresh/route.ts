import { NextResponse } from "next/server";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { buildWorkspaceFromApi } from "@/lib/build-workspace";
import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import { refreshProductsCache } from "@/lib/server/product-cache";
import { syncWorkspaceFromApi } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export async function POST() {
  if (USE_MOCK_ORDERS) {
    return NextResponse.json(
      { ok: false, error: "Обновление через API недоступно в режиме мок-заказов" },
      { status: 400 },
    );
  }

  try {
    await refreshProductsCache();
    const fresh = await buildWorkspaceFromApi();

    if (!fresh) {
      return NextResponse.json(
        { ok: false, error: "Не удалось загрузить данные с API" },
        { status: 503 },
      );
    }

    const workspace = await syncWorkspaceFromApi(fresh);

    return NextResponse.json({
      ok: true,
      workspace,
      ordersCount: fresh.orders.length,
      assemblyCount: fresh.assemblyItems.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: formatApiFetchError(error) },
      { status: 500 },
    );
  }
}
