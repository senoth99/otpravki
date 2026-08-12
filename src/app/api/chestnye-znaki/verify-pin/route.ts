import { NextResponse } from "next/server";
import {
  chestnyZnakPinCookieOptions,
  CZ_PIN_COOKIE,
  isValidChestnyZnakPin,
} from "@/lib/server/chestny-znak-pin";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin : "";

  if (!isValidChestnyZnakPin(pin)) {
    return NextResponse.json({ ok: false, error: "Неверный PIN" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(CZ_PIN_COOKIE, "1", chestnyZnakPinCookieOptions());
  return response;
}
