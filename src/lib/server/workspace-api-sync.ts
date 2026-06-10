import { mapUnshippedOrdersToWorkspace } from "@/lib/orders-mapper";
import { fetchUnshippedOrders } from "@/lib/server/orders-api";
import { syncProductImages } from "@/lib/server/image-cache";
import {
  getStaleProductsFromCache,
  refreshProductsCache,
} from "@/lib/server/product-cache";
import { logSync } from "@/lib/server/sync-log";
import { syncWorkspaceFromApi } from "@/lib/server/workspace-store";
import type { ApiProduct } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

export interface WorkspaceApiSyncResult {
  workspace: SharedWorkspaceState;
  ordersCount: number;
  assemblyCount: number;
  apiOrdersCount: number;
  inArchiveCount: number;
  note?: string;
}

export async function fetchAndSyncWorkspaceFromApi(): Promise<WorkspaceApiSyncResult> {
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

  const workspace = await syncWorkspaceFromApi(fresh);
  const activeIds = new Set(workspace.orders.map((order) => order.id));
  const inArchiveCount = fresh.orders.filter((order) => !activeIds.has(order.id)).length;

  let note = productsNote;
  if (apiOrders.length === 0) {
    note = [note, "В API нет неотправленных заказов со складом"].filter(Boolean).join(". ");
  } else if (fresh.orders.length === 0) {
    note = [
      note,
      `API вернул ${apiOrders.length} зак., но ни у одного нет позиций inStockAtWarehouse`,
    ]
      .filter(Boolean)
      .join(". ");
  } else if (inArchiveCount > 0) {
    note = [note, `${inArchiveCount} из API уже в архиве (отправлены локально)`]
      .filter(Boolean)
      .join(". ");
  }

  void logSync("api.sync.ok", {
    apiOrders: apiOrders.length,
    mappedOrders: fresh.orders.length,
    activeOrders: workspace.orders.length,
    inArchiveFromApi: inArchiveCount,
    assembly: fresh.assemblyItems.length,
    archive: workspace.shippedArchive?.length ?? 0,
    revision: workspace.revision,
  });

  return {
    workspace,
    ordersCount: workspace.orders.length,
    assemblyCount: workspace.assemblyItems.length,
    apiOrdersCount: apiOrders.length,
    inArchiveCount,
    note,
  };
}
