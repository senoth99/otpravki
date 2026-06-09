import { NextResponse } from "next/server";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { mapUnshippedOrdersToWorkspace } from "@/lib/orders-mapper";
import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import { fetchUnshippedOrders } from "@/lib/server/orders-api";
import { syncProductImages } from "@/lib/server/image-cache";
import {
  getStaleProductsFromCache,
  refreshProductsCache,
} from "@/lib/server/product-cache";
import { syncWorkspaceFromApi } from "@/lib/server/workspace-store";
import type { ApiProduct } from "@/types/shipping";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (USE_MOCK_ORDERS) {
    return NextResponse.json(
      { ok: false, error: "Обновление через API недоступно в режиме мок-заказов" },
      { status: 400 },
    );
  }

  try {
    let productsNote: string | undefined;
    let products: ApiProduct[];
    try {
      products = await refreshProductsCache();
    } catch {
      products = await getStaleProductsFromCache();
      if (products.length === 0) throw new Error("Нет кэша товаров и нет сети до API");
      productsNote = "Товары из кэша (API недоступен)";
      await syncProductImages(products);
    }

    const apiOrders = await fetchUnshippedOrders();
    const fresh =
      apiOrders.length === 0
        ? { assemblyItems: [], orders: [] }
        : mapUnshippedOrdersToWorkspace(apiOrders, products);

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
      note: productsNote,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: formatApiFetchError(error) },
      { status: 500 },
    );
  }
}
