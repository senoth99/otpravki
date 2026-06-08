import { ShippingPanel } from "@/components/otpravki";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { buildMockWorkspaceData } from "@/lib/build-mock-workspace";
import { getMockResetToken } from "@/lib/server/mock-reset";
import { getSharedWorkspace, initSharedWorkspace } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Отправки | CASHER Admin",
};

function EmptyProductsMessage() {
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

export default async function OtpravkiPage() {
  const resetToken = await getMockResetToken();
  const existing = await getSharedWorkspace();
  const mockStale =
    USE_MOCK_ORDERS &&
    resetToken !== null &&
    existing !== null &&
    existing.resetToken !== resetToken;

  if (existing && !mockStale) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
        <ShippingPanel assemblyItems={existing.assemblyItems} orders={existing.orders} />
      </div>
    );
  }

  const mockData = await buildMockWorkspaceData();
  if (!mockData) return <EmptyProductsMessage />;

  const shared = await initSharedWorkspace(
    mockData.assemblyItems,
    mockData.orders,
    resetToken ?? undefined,
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
      <ShippingPanel assemblyItems={shared.assemblyItems} orders={shared.orders} />
    </div>
  );
}
