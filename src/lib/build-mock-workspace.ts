import { buildAssemblyItemsFromProducts } from "@/lib/assembly";
import { fetchAssemblyItems } from "@/lib/api";
import { generateOrdersFromAssembly } from "@/lib/mock-orders";
import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

export async function buildMockWorkspaceData(): Promise<{
  assemblyItems: AssemblyItem[];
  orders: ShippingOrder[];
} | null> {
  const assemblyProducts = await fetchAssemblyItems();
  if (assemblyProducts.length === 0) return null;

  const rawAssemblyItems = buildAssemblyItemsFromProducts(assemblyProducts);
  const orders = generateOrdersFromAssembly(rawAssemblyItems, 5);
  const assemblyItems = sortAssemblyItemsByUrgency(rawAssemblyItems, orders);

  return { assemblyItems, orders };
}
