import { ShippingPanel } from "@/components/otpravki";
import { buildAssemblyItemsFromProducts } from "@/lib/assembly";
import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import { fetchAssemblyItems } from "@/lib/api";
import { generateOrdersFromAssembly } from "@/lib/mock-orders";
import { initSharedWorkspace } from "@/lib/server/workspace-store";

export const metadata = {
  title: "Отправки | CASHER Admin",
};

export default async function OtpravkiPage() {
  const assemblyProducts = await fetchAssemblyItems();
  const rawAssemblyItems = buildAssemblyItemsFromProducts(assemblyProducts);
  const orders = generateOrdersFromAssembly(rawAssemblyItems, 5);
  const assemblyItems = sortAssemblyItemsByUrgency(rawAssemblyItems, orders);

  const shared = await initSharedWorkspace(assemblyItems, orders);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
      <ShippingPanel assemblyItems={shared.assemblyItems} orders={shared.orders} />
    </div>
  );
}
