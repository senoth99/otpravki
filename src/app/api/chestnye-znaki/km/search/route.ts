import { NextResponse } from "next/server";
import { searchActiveKm } from "@/lib/server/chestny-znak-crpt-client";
import { hasChestnyZnakPinAccess } from "@/lib/server/chestny-znak-pin";

export async function POST(request: Request) {
  if (!(await hasChestnyZnakPinAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      maxPages?: number;
    };
    const result = await searchActiveKm({ maxPages: body.maxPages ?? 20 });
    return NextResponse.json({ ok: true, ...result });
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
