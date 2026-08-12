import { cookies } from "next/headers";

export const CZ_PIN_COOKIE = "cz_pin_ok";
const PIN_TTL_SEC = 30 * 60;

export function getChestnyZnakTestPin(): string {
  return process.env.CHESTNY_ZNAK_TEST_PIN?.trim() || "1319";
}

export function isValidChestnyZnakPin(pin: string): boolean {
  return pin.trim() === getChestnyZnakTestPin();
}

export function chestnyZnakPinCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.CHESTNY_ZNAK_COOKIE_SECURE === "true",
    path: "/",
    maxAge: PIN_TTL_SEC,
  };
}

export async function hasChestnyZnakPinAccess(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(CZ_PIN_COOKIE)?.value === "1";
}
