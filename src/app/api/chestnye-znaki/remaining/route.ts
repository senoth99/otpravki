import { NextResponse } from "next/server";
import { getRemainingByGtin } from "@/lib/server/chestny-znak-remaining";

export async function GET() {
  try {
    const remaining = await getRemainingByGtin();
    return NextResponse.json({ ok: true, remaining });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка остатков ЧЗ",
      },
      { status: 502 },
    );
  }
}
