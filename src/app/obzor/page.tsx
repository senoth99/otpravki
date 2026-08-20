import { OverviewPanel } from "@/components/overview/OverviewPanel";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { buildInitialWorkspace } from "@/lib/build-workspace";
import { loadWorkspaceFromLiveApi } from "@/lib/server/workspace-api-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Обзор | CASHER",
};

function EmptyState() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 p-4">
      <p className="text-sm text-gray-500">Нет данных по отправкам</p>
    </div>
  );
}

export default async function ObzorPage() {
  if (!USE_MOCK_ORDERS) {
    try {
      const workspace = await loadWorkspaceFromLiveApi();
      return (
        <OverviewPanel
          assemblyItems={workspace.assemblyItems}
          orders={workspace.orders}
          shippedArchive={workspace.shippedArchive}
        />
      );
    } catch {
      const mock = await buildInitialWorkspace(true);
      if (!mock) return <EmptyState />;
      return <OverviewPanel assemblyItems={mock.assemblyItems} orders={mock.orders} />;
    }
  }

  const mock = await buildInitialWorkspace(true);
  if (!mock) return <EmptyState />;
  return <OverviewPanel assemblyItems={mock.assemblyItems} orders={mock.orders} />;
}
