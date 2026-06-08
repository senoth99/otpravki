import { ShippingPanel } from "@/components/otpravki";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { buildInitialWorkspace } from "@/lib/build-workspace";
import { getMockResetToken } from "@/lib/server/mock-reset";
import {
  getSharedWorkspace,
  initSharedWorkspace,
  syncWorkspaceFromApi,
} from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Отправки | CASHER Admin",
};

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="mt-2 text-sm text-gray-500">{hint}</p>
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

  if (existing && !mockStale && USE_MOCK_ORDERS) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
        <ShippingPanel assemblyItems={existing.assemblyItems} orders={existing.orders} />
      </div>
    );
  }

  let workspaceData;
  try {
    workspaceData = await buildInitialWorkspace(USE_MOCK_ORDERS);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка загрузки заказов";
    return (
      <EmptyState
        title="Не удалось загрузить заказы"
        hint={`${message}. Проверь CASHER_API_KEY в .env и: sudo systemctl restart otpravki`}
      />
    );
  }

  if (!workspaceData) {
    return (
      <EmptyState
        title="Нет данных о товарах"
        hint="Подключите интернет и обновите страницу — товары загрузятся автоматически"
      />
    );
  }

  if (!USE_MOCK_ORDERS && workspaceData.orders.length === 0) {
    return (
      <EmptyState
        title="Нет заказов на отправку"
        hint="Все неотправленные заказы либо без товара на складе, либо уже обработаны"
      />
    );
  }

  const shared = USE_MOCK_ORDERS
    ? await initSharedWorkspace(
        workspaceData.assemblyItems,
        workspaceData.orders,
        resetToken ?? undefined,
      )
    : existing
      ? await syncWorkspaceFromApi(workspaceData)
      : await initSharedWorkspace(workspaceData.assemblyItems, workspaceData.orders);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
      <ShippingPanel assemblyItems={shared.assemblyItems} orders={shared.orders} />
    </div>
  );
}
