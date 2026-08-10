import { ShippingPanel } from "@/components/otpravki";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { describeCasherLoadError } from "@/lib/casher-error";
import { buildInitialWorkspace } from "@/lib/build-workspace";
import { getMockResetToken } from "@/lib/server/mock-reset";
import { fetchAndSyncWorkspaceFromApi } from "@/lib/server/workspace-api-sync";
import { getWarehouseMap } from "@/lib/server/warehouse-map-store";
import { getSharedWorkspace, initSharedWorkspace } from "@/lib/server/workspace-store";
import type { WarehouseMapConfig } from "@/types/stock";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Отправки | CASHER Admin",
};

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-dvh max-h-dvh w-full items-center justify-center overflow-hidden bg-gray-50 p-4 overscroll-none">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
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
  warehouseMap,
}: {
  assemblyItems: Parameters<typeof ShippingPanel>[0]["assemblyItems"];
  orders: Parameters<typeof ShippingPanel>[0]["orders"];
  apiOrderIds?: string[];
  shippedArchive?: Parameters<typeof ShippingPanel>[0]["shippedArchive"];
  initialRevision?: number;
  warehouseMap?: WarehouseMapConfig;
}) {
  return (
    <ShippingPanel
      assemblyItems={assemblyItems}
      orders={orders}
      apiOrderIds={apiOrderIds}
      shippedArchive={shippedArchive}
      initialRevision={initialRevision}
      warehouseMap={warehouseMap}
    />
  );
}

export default async function OtpravkiPage() {
  const [resetToken, warehouseMap] = await Promise.all([
    getMockResetToken(),
    getWarehouseMap().catch(() => ({ furniture: [], updatedAt: 0 })),
  ]);

  if (!USE_MOCK_ORDERS) {
    try {
      const existing = await getSharedWorkspace();
      const workspace = existing ?? (await fetchAndSyncWorkspaceFromApi()).workspace;
      return (
        <OtpravkiShell
          assemblyItems={workspace.assemblyItems}
          orders={workspace.orders}
          apiOrderIds={workspace.apiOrderIds}
          shippedArchive={workspace.shippedArchive}
          initialRevision={workspace.revision}
          warehouseMap={warehouseMap}
        />
      );
    } catch (error) {
      const { title, hint } = describeCasherLoadError(error);
      return <EmptyState title={title} hint={hint} />;
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
        warehouseMap={warehouseMap}
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
      warehouseMap={warehouseMap}
    />
  );
}
