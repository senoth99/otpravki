import { NextResponse } from "next/server";
import {
  destroyAuthSession,
  expireSessionCookieOnResponse,
  readSessionTokenFromCookies,
} from "@/lib/server/auth-session";
import {
  countShipmentsForShift,
  loadShipmentEvents,
  recordShiftSummary,
} from "@/lib/server/shift-stats-store";

function logoutRedirect(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "192.168.1.100:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return expireSessionCookieOnResponse(
    NextResponse.redirect(new URL("/otpravki", `${proto}://${host}`), { status: 303 }),
  );
}

/** Если Safari открывает URL логаута как страницу — не показываем пустой 405. */
export async function GET(request: Request) {
  return logoutRedirect(request);
}

export async function POST(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  const wantsJson = accept.includes("application/json");
  let shiftShipments = 0;

  try {
    const token = await readSessionTokenFromCookies();
    if (token) {
      const session = await destroyAuthSession(token);
      if (session) {
        const events = await loadShipmentEvents();
        shiftShipments = countShipmentsForShift(
          events,
          session.userId,
          session.shiftStartedAt,
        );
        await recordShiftSummary({
          userId: session.userId,
          startedAt: session.shiftStartedAt,
          endedAt: Date.now(),
          shipments: shiftShipments,
        });
      }
    }
  } catch {
    // всё равно выходим
  }

  if (!wantsJson) {
    return logoutRedirect(request);
  }

  return expireSessionCookieOnResponse(
    NextResponse.json({ ok: true, shiftShipments }),
  );
}
