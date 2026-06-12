import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { getSharedWorkspace, persistAndReplaceArchive } from "@/lib/server/workspace-store";
import type { ShippingOrder } from "@/types/shipping";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as { orders?: ShippingOrder[] };
    const incoming = body.orders?.filter((order) => order?.id && order.barcodePrinted) ?? [];

    if (incoming.length === 0) {
      return NextResponse.json({ ok: false, error: "Нет отправленных заказов" }, { status: 400 });
    }

    const archive = await persistAndReplaceArchive(incoming);

    const workspace = await getSharedWorkspace();
    return NextResponse.json({
      ok: true,
      archiveCount: archive.length,
      revision: workspace?.revision ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ошибка архива" },
      { status: 500 },
    );
  }
}
