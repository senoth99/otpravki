import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  destroyAuthSession,
  readSessionTokenFromCookies,
} from "@/lib/server/auth-session";
import {
  countShipmentsForShift,
  loadShipmentEvents,
  recordShiftSummary,
} from "@/lib/server/shift-stats-store";

export async function POST() {
  const token = await readSessionTokenFromCookies();
  let shiftShipments = 0;

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

  await clearSessionCookie();
  return NextResponse.json({ ok: true, shiftShipments });
}
