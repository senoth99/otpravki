import { NextResponse } from "next/server";
import { hasChestnyZnakPinAccess } from "@/lib/server/chestny-znak-pin";
import {
  getChestnyZnakSettings,
  setChestnyZnakPackingEnabled,
} from "@/lib/server/chestny-znak-settings";

export async function GET() {
  const settings = await getChestnyZnakSettings();
  return NextResponse.json({ ok: true, ...settings });
}

export async function PATCH(request: Request) {
  if (!(await hasChestnyZnakPinAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "Нужен enabled: true или false" }, { status: 400 });
  }

  const settings = await setChestnyZnakPackingEnabled(body.enabled);
  return NextResponse.json({ ok: true, ...settings });
}
