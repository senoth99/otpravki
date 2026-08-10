import { NextResponse } from "next/server";
import { USE_MOCK_ORDERS } from "@/lib/app-config";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import { logSync } from "@/lib/server/sync-log";
import { fetchAndSyncWorkspaceFromApi, fetchAndSyncWorkspaceFromApiForBrand } from "@/lib/server/workspace-api-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  if (USE_MOCK_ORDERS) {
    return NextResponse.json(
      { ok: false, error: "Обновление через API недоступно в режиме мок-заказов" },
      { status: 400 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { brand?: unknown };
    const brand = typeof body.brand === "string" ? body.brand.trim() : "";
    const result = brand
      ? await fetchAndSyncWorkspaceFromApiForBrand(brand)
      : await fetchAndSyncWorkspaceFromApi();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = formatApiFetchError(error);
    void logSync("api.refresh.fail", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
