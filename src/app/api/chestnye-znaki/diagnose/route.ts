import { NextResponse } from "next/server";
import { diagnoseCrpt } from "@/lib/server/chestny-znak-api";
import { hasChestnyZnakPinAccess } from "@/lib/server/chestny-znak-pin";

export async function GET() {
  if (!(await hasChestnyZnakPinAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN" }, { status: 401 });
  }

  const result = await diagnoseCrpt();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
