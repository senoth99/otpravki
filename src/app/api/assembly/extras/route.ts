import { NextResponse } from "next/server";
import { listAssemblyExtras } from "@/lib/server/assembly-extras-store";

export async function GET(request: Request) {
  const brand = new URL(request.url).searchParams.get("brand")?.trim() ?? "";
  const extras = await listAssemblyExtras(brand || undefined);
  return NextResponse.json({ ok: true, extras });
}
