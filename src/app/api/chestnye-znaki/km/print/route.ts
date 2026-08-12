import { NextResponse } from "next/server";
import { printKmLabel } from "@/lib/server/km-label-printer";
import { hasChestnyZnakPinAccess } from "@/lib/server/chestny-znak-pin";

export async function POST(request: Request) {
  if (!(await hasChestnyZnakPinAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { cis?: string; gtin?: string };
    if (!body.cis?.trim()) {
      return NextResponse.json({ ok: false, error: "Не указан cis" }, { status: 400 });
    }

    const result = await printKmLabel({
      cis: body.cis.trim(),
      gtin: body.gtin?.trim(),
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Ошибка печати" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, printer: result.printer });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка печати",
      },
      { status: 502 },
    );
  }
}
