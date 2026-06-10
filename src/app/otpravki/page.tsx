import { ShippingPanel } from "@/components/otpravki";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { buildInitialWorkspace } from "@/lib/build-workspace";
import { getMockResetToken } from "@/lib/server/mock-reset";
import { fetchAndSyncWorkspaceFromApi } from "@/lib/server/workspace-api-sync";
import { getSharedWorkspace, initSharedWorkspace } from "@/lib/server/workspace-store";

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

function OtpravkiShell({
  assemblyItems,
  orders,
  apiOrderIds,
  shippedArchive,
  initialRevision,
}: {
  assemblyItems: Parameters<typeof ShippingPanel>[0]["assemblyItems"];
  orders: Parameters<typeof ShippingPanel>[0]["orders"];
  apiOrderIds?: string[];
  shippedArchive?: Parameters<typeof ShippingPanel>[0]["shippedArchive"];
  initialRevision?: number;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
      <ShippingPanel
        assemblyItems={assemblyItems}
        orders={orders}
        apiOrderIds={apiOrderIds}
        shippedArchive={shippedArchive}
        initialRevision={initialRevision}
      />
    </div>
  );
}

export default async function OtpravkiPage() {
  const resetToken = await getMockResetToken();

  if (!USE_MOCK_ORDERS) {
    const existing = await getSharedWorkspace();
    try {
      const { workspace } = await fetchAndSyncWorkspaceFromApi();
      return (
        <OtpravkiShell
          assemblyItems={workspace.assemblyItems}
          orders={workspace.orders}
          apiOrderIds={workspace.apiOrderIds}
          shippedArchive={workspace.shippedArchive}
          initialRevision={workspace.revision}
        />
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка загрузки заказов";
      if (existing) {
        return (
          <OtpravkiShell
            assemblyItems={existing.assemblyItems}
            orders={existing.orders}
            apiOrderIds={existing.apiOrderIds}
            shippedArchive={existing.shippedArchive}
            initialRevision={existing.revision}
          />
        );
      }
      return (
        <EmptyState
          title="Не удалось загрузить заказы"
          hint={`${message}. Проверь CASHER_API_KEY в .env и: sudo systemctl restart otpravki`}
        />
      );
    }
  }

  const existing = await getSharedWorkspace();
  const mockStale =
    resetToken !== null && existing !== null && existing.resetToken !== resetToken;

  if (existing && !mockStale) {
    return (
      <OtpravkiShell
        assemblyItems={existing.assemblyItems}
        orders={existing.orders}
        apiOrderIds={existing.apiOrderIds}
        shippedArchive={existing.shippedArchive}
        initialRevision={existing.revision}
      />
    );
  }

  let workspaceData;
  try {
    workspaceData = await buildInitialWorkspace(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка загрузки заказов";
    return <EmptyState title="Не удалось загрузить заказы" hint={message} />;
  }

  if (!workspaceData) {
    return (
      <EmptyState
        title="Нет данных о товарах"
        hint="Подключите интернет и обновите страницу"
      />
    );
  }

  const shared = await initSharedWorkspace(
    workspaceData.assemblyItems,
    workspaceData.orders,
    resetToken ?? undefined,
  );

  return (
    <OtpravkiShell
      assemblyItems={shared.assemblyItems}
      orders={shared.orders}
      apiOrderIds={shared.apiOrderIds}
      shippedArchive={shared.shippedArchive}
      initialRevision={shared.revision}
    />
  );
}
