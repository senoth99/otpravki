import { OverviewPanel } from "@/components/overview/OverviewPanel";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { buildInitialWorkspace } from "@/lib/build-workspace";
import { fetchAndSyncWorkspaceFromApi } from "@/lib/server/workspace-api-sync";
import { getSharedWorkspace } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

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
  const existing = await getSharedWorkspace();
  if (existing) {
    return (
      <OverviewPanel
        assemblyItems={existing.assemblyItems}
        orders={existing.orders}
        shippedArchive={existing.shippedArchive}
      />
    );
  }

  if (!USE_MOCK_ORDERS) {
    try {
      const { workspace } = await fetchAndSyncWorkspaceFromApi();
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
