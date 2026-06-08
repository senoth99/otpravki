import { fetchProducts } from "@/lib/api";
import { buildMockWorkspaceData } from "@/lib/build-mock-workspace";
import { mapUnshippedOrdersToWorkspace } from "@/lib/orders-mapper";
import { fetchUnshippedOrders } from "@/lib/server/orders-api";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

export interface WorkspaceData {
  assemblyItems: AssemblyItem[];
  orders: ShippingOrder[];
}

export async function buildWorkspaceFromApi(): Promise<WorkspaceData | null> {
  const [apiOrders, products] = await Promise.all([fetchUnshippedOrders(), fetchProducts()]);

  if (apiOrders.length === 0) {
    return { assemblyItems: [], orders: [] };
  }

  return mapUnshippedOrdersToWorkspace(apiOrders, products);
}

export async function buildInitialWorkspace(useMock: boolean): Promise<WorkspaceData | null> {
  if (useMock) {
    return buildMockWorkspaceData();
  }

  return buildWorkspaceFromApi();
}
