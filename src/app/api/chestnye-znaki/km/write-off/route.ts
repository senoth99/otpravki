import { NextResponse } from "next/server";
import { writeOffKm } from "@/lib/server/chestny-znak-crpt-client";
import { hasChestnyZnakPinAccess } from "@/lib/server/chestny-znak-pin";

export async function POST(request: Request) {
  if (!(await hasChestnyZnakPinAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      cisList?: string[];
      reason?: string;
      docNum?: string;
      address?: string;
    };

    const cisList = (body.cisList ?? []).map((c) => c.trim()).filter(Boolean);
    if (cisList.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Не выбраны коды для списания" },
        { status: 400 },
      );
    }

    const result = await writeOffKm(cisList, {
      reason: body.reason,
      docNum: body.docNum,
      address: body.address,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка списания",
      },
      { status: 502 },
    );
  }
}
