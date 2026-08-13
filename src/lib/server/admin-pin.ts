import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  chestnyZnakPinCookieOptions,
  CZ_PIN_COOKIE,
  getChestnyZnakTestPin,
} from "@/lib/server/chestny-znak-pin";

const ADMIN_TTL_SEC = 12 * 60 * 60;

export function getAdminPin(): string {
  return getChestnyZnakTestPin();
}

export function isValidAdminPin(pin: string): boolean {
  return pin.trim() === getAdminPin();
}

export function adminPinCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.CHESTNY_ZNAK_COOKIE_SECURE === "true",
    path: "/",
    maxAge: ADMIN_TTL_SEC,
  };
}

export async function hasAdminAccess(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === "1";
}

export function applyAdminCookies(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_COOKIE, "1", adminPinCookieOptions());
  response.cookies.set(CZ_PIN_COOKIE, "1", chestnyZnakPinCookieOptions());
  return response;
}
