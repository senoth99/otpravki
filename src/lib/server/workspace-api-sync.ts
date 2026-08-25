import { mapUnshippedOrdersToWorkspace } from "@/lib/orders-mapper";
import { fetchUnshippedOrders, fetchUnshippedOrdersForBrand } from "@/lib/server/orders-api";
import { fetchAllBrandProducts } from "@/lib/server/production-api";
import { getProductsWithCache, getStaleProductsFromCache, rememberProductsCache } from "@/lib/server/product-cache";
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

export interface WorkspaceApiSyncOptions {
  bypassProductCache?: boolean;
}

async function fetchProducts(bypassCache = false): Promise<ApiProduct[]> {
  if (!bypassCache) {
    const cached = await getProductsWithCache();
    if (cached.products.length > 0 && cached.source !== "empty") return cached.products;
  }

  try {
    const products = await fetchAllBrandProducts();
    if (products.length > 0) {
      void rememberProductsCache(products).catch(() => undefined);
      return products;
    }
  } catch (error) {
    const stale = await getStaleProductsFromCache();
    if (stale.length > 0) return stale;
    throw error;
  }

  const stale = await getStaleProductsFromCache();
  if (stale.length > 0) return stale;
  throw new Error("Товары недоступны: пустой каталог по всем брендам (api.amarix.ru)");
}

export async function fetchAndSyncWorkspaceFromApi(
  options?: WorkspaceApiSyncOptions,
): Promise<WorkspaceApiSyncResult> {
  const [products, apiOrders] = await Promise.all([
    fetchProducts(options?.bypassProductCache),
    fetchUnshippedOrders(),
  ]);

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
  options?: WorkspaceApiSyncOptions,
): Promise<WorkspaceApiSyncResult> {
  const [products, apiOrders] = await Promise.all([
    fetchProducts(options?.bypassProductCache),
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
