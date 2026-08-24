import { SborkaBootstrap } from "@/components/otpravki/SborkaBootstrap";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { describeCasherLoadError } from "@/lib/casher-error";
import { buildInitialWorkspace } from "@/lib/build-workspace";
import { getMockResetToken } from "@/lib/server/mock-reset";
import { loadWorkspaceFromLiveApi } from "@/lib/server/workspace-api-sync";
import { getSharedWorkspace, initSharedWorkspace } from "@/lib/server/workspace-store";
import { AssemblyPanel } from "@/components/otpravki/AssemblyPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Сборка | CASHER Admin",
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

export default async function SborkaPage() {
  if (!USE_MOCK_ORDERS) {
    // Прогреваем кэш заказов на сервере, UI грузим с клиента — без тяжёлого SSR.
    try {
      await loadWorkspaceFromLiveApi();
    } catch {
      // Клиент попробует /api/workspace; при ошибке покажет подсказку.
    }
    return <SborkaBootstrap />;
  }

  const resetToken = await getMockResetToken();
  const existing = await getSharedWorkspace();
  const mockStale =
    resetToken !== null && existing !== null && existing.resetToken !== resetToken;

  if (existing && !mockStale) {
    return (
      <AssemblyPanel
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
      <EmptyState title="Нет данных о товарах" hint="Подключите интернет и обновите страницу" />
    );
  }

  const shared = await initSharedWorkspace(
    workspaceData.assemblyItems,
    workspaceData.orders,
    resetToken ?? undefined,
  );

  return (
    <AssemblyPanel
      assemblyItems={shared.assemblyItems}
      orders={shared.orders}
      apiOrderIds={shared.apiOrderIds}
      shippedArchive={shared.shippedArchive}
      initialRevision={shared.revision}
    />
  );
}
