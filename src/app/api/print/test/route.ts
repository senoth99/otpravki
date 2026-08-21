import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { hasAdminAccess } from "@/lib/server/admin-pin";
import {
  printLabelTemplate,
  type TestLabelKind,
} from "@/lib/server/brand-barcode-label";
import { detectBarcodePrinter } from "@/lib/server/barcode-printer";

export const maxDuration = 60;

function parseKind(value: unknown): TestLabelKind | null {
  if (value === "ammo" || value === "kurazh" || value === "track") return value;
  return null;
}

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, message: "Нужен PIN админки" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { kind?: unknown };
  const kind = parseKind(body.kind);
  if (!kind) {
    return NextResponse.json(
      { ok: false, message: "Укажи kind: ammo | kurazh | track" },
      { status: 400 },
    );
  }

  const printer = await detectBarcodePrinter();
  if (!printer) {
    return NextResponse.json(
      { ok: false, message: "Принтер не настроен в CUPS" },
      { status: 500 },
    );
  }

  try {
    const format = await printLabelTemplate(printer, kind);
    return NextResponse.json({
      ok: true,
      kind,
      printer,
      format,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        kind,
        printer,
        message: error instanceof Error ? error.message : "Не удалось напечатать",
      },
      { status: 500 },
    );
  }
}
