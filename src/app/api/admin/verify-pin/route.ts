import { NextResponse } from "next/server";
import { applyAdminCookies, isValidAdminPin } from "@/lib/server/admin-pin";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin : "";

  if (!isValidAdminPin(pin)) {
    return NextResponse.json({ ok: false, error: "Неверный PIN" }, { status: 401 });
  }

  return applyAdminCookies(NextResponse.json({ ok: true }));
}
