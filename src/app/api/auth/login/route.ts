import { NextResponse } from "next/server";
import { createAuthSession, setSessionCookie } from "@/lib/server/auth-session";
import { getAuthUserById, publicUser, verifyPin } from "@/lib/server/auth-users-store";
import { buildUserLiveStats } from "@/lib/server/shift-stats-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; pin?: string };
    const userId = body.userId?.trim() ?? "";
    const pin = body.pin?.trim() ?? "";

    if (!userId || !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { ok: false, error: "Выберите аккаунт и введите PIN" },
        { status: 400 },
      );
    }

    const user = await getAuthUserById(userId);
    if (!user || !verifyPin(pin, user)) {
      return NextResponse.json(
        { ok: false, error: "Неверный PIN" },
        { status: 401 },
      );
    }

    const session = await createAuthSession(user.id);
    await setSessionCookie(session.token);
    const stats = await buildUserLiveStats(user, session);

    return NextResponse.json({
      ok: true,
      user: publicUser(user),
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка входа",
      },
      { status: 500 },
    );
  }
}
