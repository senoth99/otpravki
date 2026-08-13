import { NextResponse } from "next/server";
import { clearAdminCookies } from "@/lib/server/admin-pin";

export async function POST() {
  return clearAdminCookies(NextResponse.json({ ok: true }));
}
