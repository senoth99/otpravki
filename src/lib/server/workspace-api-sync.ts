import { mapUnshippedOrdersToWorkspace } from "@/lib/orders-mapper";
import { fetchUnshippedOrders } from "@/lib/server/orders-api";
import { externalFetch } from "@/lib/server/external-fetch";
import { syncProductImages } from "@/lib/server/image-cache";
import { logSync } from "@/lib/server/sync-log";
import { replaceWorkspaceFromApi } from "@/lib/server/workspace-store";
import type { ApiProduct } from "@/types/shipping";
import type { SharedWorkspaceState } from "@/types/workspace";

const PRODUCTS_API = process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com";

export interface WorkspaceApiSyncResult {
  workspace: SharedWorkspaceState;
  ordersCount: number;
  assemblyCount: number;
  apiOrdersCount: number;
}

async function fetchProductsLive(): Promise<ApiProduct[]> {
  const res = await externalFetch(`${PRODUCTS_API}/products`, { timeoutMs: 20_000 });
  if (!res.ok) {
    throw new Error(`Товары недоступны: HTTP ${res.status}. Нужен интернет до api.cashercollection.com`);
  }
  const data: ApiProduct[] = await res.json();
  const products = data.filter((product) => product.images.length > 0);
  await syncProductImages(products);
  return products;
}

export async function fetchAndSyncWorkspaceFromApi(): Promise<WorkspaceApiSyncResult> {
  const [products, apiOrders] = await Promise.all([fetchProductsLive(), fetchUnshippedOrders()]);

  const fresh =
    apiOrders.length === 0
      ? { assemblyItems: [], orders: [] }
      : mapUnshippedOrdersToWorkspace(apiOrders, products);

  const workspace = await replaceWorkspaceFromApi(fresh);

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
