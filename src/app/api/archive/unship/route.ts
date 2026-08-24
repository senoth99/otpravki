import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { unshipOrdersFromArchive } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json().catch(() => ({}))) as { orderIds?: unknown };
    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];

    if (orderIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Нет заказов для отмены" }, { status: 400 });
    }

    const result = await unshipOrdersFromArchive(orderIds);
    return NextResponse.json({
      ok: true,
      removed: result.removed,
      archiveCount: result.archiveCount,
      revision: result.revision,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ошибка отмены отправки" },
      { status: 500 },
    );
  }
}
