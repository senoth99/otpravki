import { mapUnshippedOrdersToWorkspace } from "@/lib/orders-mapper";
import { fetchUnshippedOrders, fetchUnshippedOrdersForBrand } from "@/lib/server/orders-api";
import { fetchAllBrandProducts } from "@/lib/server/production-api";
import { logSync } from "@/lib/server/sync-log";
import { ingestGtinCatalogFromOrders } from "@/lib/server/chestny-znak-gtin-catalog";
import {
  getSharedWorkspace,
  replaceWorkspaceFromApi,
  replaceWorkspaceFromApiForBrand,
} from "@/lib/server/workspace-store";
import type { ApiProduct } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

export interface WorkspaceApiSyncResult {
  workspace: SharedWorkspaceState;
  ordersCount: number;
  assemblyCount: number;
  apiOrdersCount: number;
}

async function fetchProductsLive(): Promise<ApiProduct[]> {
  // Один токен = один бренд: склеиваем каталоги всех ORDERS/PRODUCTION ключей.
  const products = await fetchAllBrandProducts();
  if (products.length === 0) {
    throw new Error("Товары недоступны: пустой каталог по всем брендам (api.amarix.ru)");
  }
  return products;
}

export async function fetchAndSyncWorkspaceFromApi(): Promise<WorkspaceApiSyncResult> {
  const [products, apiOrders] = await Promise.all([fetchProductsLive(), fetchUnshippedOrders()]);

  const fresh = {
    ...mapUnshippedOrdersToWorkspace(apiOrders, products),
    apiOrderIds: apiOrders.map(
      (order) => `${(order.storeBrand ?? "CASHER").toLowerCase()}:${order.remoteOrderId}`,
    ),
  };

  const workspace = await replaceWorkspaceFromApi(fresh);
  void ingestGtinCatalogFromOrders(fresh.orders).catch(() => undefined);

  void logSync("api.sync.ok", {
    apiOrders: apiOrders.length,
    mappedOrders: fresh.orders.length,
    activeOrders: workspace.orders.length,
    assembly: fresh.assemblyItems.length,
    revision: workspace.revision,
  });

  return {
    workspace,
    ordersCount: workspace.orders.length,
    assemblyCount: workspace.assemblyItems.length,
    apiOrdersCount: apiOrders.length,
  };
}

export async function fetchAndSyncWorkspaceFromApiForBrand(
  brand: string,
): Promise<WorkspaceApiSyncResult> {
  const [products, apiOrders] = await Promise.all([
    fetchProductsLive(),
    fetchUnshippedOrdersForBrand(brand),
  ]);

  const fresh = {
    ...mapUnshippedOrdersToWorkspace(apiOrders, products),
    apiOrderIds: apiOrders.map(
      (order) => `${(order.storeBrand ?? "CASHER").toLowerCase()}:${order.remoteOrderId}`,
    ),
  };

  const workspace = await replaceWorkspaceFromApiForBrand(brand, fresh);
  void ingestGtinCatalogFromOrders(fresh.orders).catch(() => undefined);

  void logSync("api.sync.brand.ok", {
    brand,
    apiOrders: apiOrders.length,
    mappedOrders: fresh.orders.length,
    activeOrders: workspace.orders.length,
    assembly: fresh.assemblyItems.length,
    revision: workspace.revision,
  });

  return {
    workspace,
    ordersCount: workspace.orders.length,
    assemblyCount: workspace.assemblyItems.length,
    apiOrdersCount: apiOrders.length,
  };
}

/**
 * Быстрый первый ответ: отдаём уже синхронированный workspace из памяти,
 * а полный pull Casher гоняем в фоне. Первый холодный старт — ждём API.
 */
export async function loadWorkspaceFromLiveApi(): Promise<SharedWorkspaceState> {
  const existing = await getSharedWorkspace();
  const hasUsableCache =
    existing != null &&
    ((existing.orders?.length ?? 0) > 0 || (existing.assemblyItems?.length ?? 0) > 0);

  if (hasUsableCache && existing) {
    void fetchAndSyncWorkspaceFromApi().catch((error) => {
      void logSync("api.sync.bg.fail", {
        message: error instanceof Error ? error.message : "bg sync failed",
      });
    });
    return existing;
  }

  try {
    return (await fetchAndSyncWorkspaceFromApi()).workspace;
  } catch (error) {
    if (existing) return existing;
    throw error;
  }
}
