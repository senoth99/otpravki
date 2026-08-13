import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/server/admin-pin";

export async function GET() {
  const ok = await hasAdminAccess();
  if (!ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
