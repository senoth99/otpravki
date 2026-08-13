import { NextResponse } from "next/server";
import { searchActiveKm } from "@/lib/server/chestny-znak-crpt-client";
import { getGtinProductCatalog, type GtinProductInfo } from "@/lib/server/chestny-znak-gtin-catalog";
import { hasChestnyZnakPinAccess } from "@/lib/server/chestny-znak-pin";

export async function POST(request: Request) {
  if (!(await hasChestnyZnakPinAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      maxPages?: number;
      cursor?: { lastEmissionDate: string; sgtin: string } | null;
    };
    const [result, catalog] = await Promise.all([
      searchActiveKm({
        maxPages: body.maxPages ?? 1,
        cursor: body.cursor ?? null,
      }),
      getGtinProductCatalog().catch((): Record<string, GtinProductInfo> => ({})),
    ]);
    return NextResponse.json({ ok: true, ...result, catalog });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка загрузки КМ",
      },
      { status: 502 },
    );
  }
}
