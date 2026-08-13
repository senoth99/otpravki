import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/server/auth-session";
import { buildUserLiveStats } from "@/lib/server/shift-stats-store";

export async function GET() {
  const ctx = await requireUserSession({ touch: true });
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });
  }

  const stats = await buildUserLiveStats(ctx.user, ctx.session);
  return NextResponse.json({
    ok: true,
    user: ctx.publicUser,
    stats,
    shiftStartedAt: ctx.session.shiftStartedAt,
    lastActiveAt: ctx.session.lastActiveAt,
  });
}
