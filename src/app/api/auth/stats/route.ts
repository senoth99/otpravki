import { NextResponse } from "next/server";
import { buildAllAccountsStats } from "@/lib/server/shift-stats-store";

export async function GET() {
  const rows = await buildAllAccountsStats();
  return NextResponse.json({ ok: true, accounts: rows });
}
