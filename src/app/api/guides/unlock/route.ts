import { NextResponse } from "next/server";
import { isValidGuidesLockPin } from "@/lib/server/guides-pin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!isValidGuidesLockPin(pin)) {
    return NextResponse.json({ ok: false, error: "Неверный код" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
