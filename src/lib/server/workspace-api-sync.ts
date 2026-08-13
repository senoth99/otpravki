import { mapUnshippedOrdersToWorkspace } from "@/lib/orders-mapper";
import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import { fetchUnshippedOrders, fetchUnshippedOrdersForBrand } from "@/lib/server/orders-api";
import { externalFetch } from "@/lib/server/external-fetch";
import { logSync } from "@/lib/server/sync-log";
import { ingestGtinCatalogFromOrders } from "@/lib/server/chestny-znak-gtin-catalog";
import {
  getSharedWorkspace,
  replaceWorkspaceFromApi,
  replaceWorkspaceFromApiForBrand,
} from "@/lib/server/workspace-store";
import type { ApiProduct } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

const PRODUCTS_API = process.env.PRODUCTS_API_URL ?? "https://api.amarix.ru";
const PRODUCTS_URL = `${PRODUCTS_API}/products`;

export interface WorkspaceApiSyncResult {
  workspace: SharedWorkspaceState;
  ordersCount: number;
  assemblyCount: number;
  apiOrdersCount: number;
}

async function fetchProductsLive(): Promise<ApiProduct[]> {
  let res: Response;
  try {
    res = await externalFetch(PRODUCTS_URL, { timeoutMs: 20_000 });
  } catch (error) {
    throw new Error(formatApiFetchError(error, PRODUCTS_URL));
  }

  if (!res.ok) {
    throw new Error(`Товары недоступны: HTTP ${res.status}. Нужен интернет до api.amarix.ru`);
  }

  const data: ApiProduct[] = await res.json();
  return data.filter((product) => product.images.length > 0);
}

export async function fetchAndSyncWorkspaceFromApi(): Promise<WorkspaceApiSyncResult> {
  const [products, apiOrders] = await Promise.all([fetchProductsLive(), fetchUnshippedOrders()]);

  if (apiOrders.length === 0) {
    const workspace = await getSharedWorkspace();
    if (workspace) {
      void logSync("api.sync.empty", { keptOrders: workspace.orders.length });
      return {
        workspace,
        ordersCount: workspace.orders.length,
        assemblyCount: workspace.assemblyItems.length,
        apiOrdersCount: 0,
      };
    }
  }

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
