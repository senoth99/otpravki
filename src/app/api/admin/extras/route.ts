import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/server/admin-pin";
import { listAssemblyExtras, saveAssemblyExtras } from "@/lib/server/assembly-extras-store";
import type { AssemblyExtra } from "@/lib/server/assembly-extras-store";

export async function GET() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN админки" }, { status: 401 });
  }
  const extras = await listAssemblyExtras();
  return NextResponse.json({ ok: true, extras });
}

export async function PUT(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN админки" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { extras?: unknown };
  if (!Array.isArray(body.extras)) {
    return NextResponse.json({ ok: false, error: "Нужен список допов" }, { status: 400 });
  }
  const extras = await saveAssemblyExtras(body.extras as AssemblyExtra[]);
  return NextResponse.json({ ok: true, extras });
}
