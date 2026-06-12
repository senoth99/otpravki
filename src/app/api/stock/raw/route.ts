import { NextResponse } from "next/server";
import { externalFetch } from "@/lib/server/external-fetch";
import { casherAuthHeaders, getCasherApiKey } from "@/lib/server/casher-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = getCasherApiKey();
  if (!key) {
    return NextResponse.json({ error: "no api key" }, { status: 400 });
  }

  const res = await externalFetch("https://api.cashercollection.com/warehouses/2/stock", {
    headers: { ...casherAuthHeaders(), Accept: "application/json" },
    timeoutMs: 20_000,
  });

  const json = await res.json();
  const arr = Array.isArray(json) ? json : [json];
  return NextResponse.json({ total: arr.length, first3: arr.slice(0, 3) });
}
