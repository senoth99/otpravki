import { ShippingPanel } from "@/components/otpravki";
import { buildAssemblyItemsFromProducts } from "@/lib/assembly";
import { sortAssemblyItemsByUrgency } from "@/lib/assembly-sort";
import { fetchAssemblyItems } from "@/lib/api";
import { generateOrdersFromAssembly } from "@/lib/mock-orders";
import { getSharedWorkspace, initSharedWorkspace } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Отправки | CASHER Admin",
};

export default async function OtpravkiPage() {
  const existing = await getSharedWorkspace();
  if (existing) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
        <ShippingPanel assemblyItems={existing.assemblyItems} orders={existing.orders} />
      </div>
    );
  }

  const assemblyProducts = await fetchAssemblyItems();
  if (assemblyProducts.length === 0) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="font-medium text-gray-900">Нет данных о товарах</p>
          <p className="mt-2 text-sm text-gray-500">
            Подключите интернет и обновите страницу — товары загрузятся автоматически
          </p>
        </div>
      </div>
    );
  }

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
