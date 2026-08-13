import { NextResponse } from "next/server";
import { createAuthSession, setSessionCookie } from "@/lib/server/auth-session";
import { publicUser, registerAuthUser } from "@/lib/server/auth-users-store";
import { buildUserLiveStats } from "@/lib/server/shift-stats-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      letter?: string;
      emoji?: string;
      pin?: string;
    };

    const user = await registerAuthUser({
      letter: body.letter ?? "",
      emoji: body.emoji ?? "",
      pin: body.pin ?? "",
    });
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
        error: error instanceof Error ? error.message : "Ошибка регистрации",
      },
      { status: 400 },
    );
  }
}
