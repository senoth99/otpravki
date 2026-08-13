import { NextResponse } from "next/server";
import {
  listAuthUsers,
  listFreeEmojis,
  publicUser,
  MAX_AUTH_USERS,
  AUTH_EMOJI_POOL,
} from "@/lib/server/auth-users-store";

export async function GET() {
  const [users, freeEmojis] = await Promise.all([listAuthUsers(), listFreeEmojis()]);
  return NextResponse.json({
    ok: true,
    users: users.map(publicUser),
    freeEmojis,
    emojiPool: AUTH_EMOJI_POOL,
    maxUsers: MAX_AUTH_USERS,
    canRegister: users.length < MAX_AUTH_USERS && freeEmojis.length > 0,
  });
}
