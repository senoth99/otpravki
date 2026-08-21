import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { hasAdminAccess } from "@/lib/server/admin-pin";
import {
  parseTestBrand,
  printLabelTemplate,
  printTestLabel,
  type TestLabelKind,
  type TestPrintKind,
  type TestTrackBrand,
} from "@/lib/server/brand-barcode-label";
import { detectBarcodePrinter } from "@/lib/server/barcode-printer";

export const maxDuration = 60;

function parseLegacyKind(value: unknown): TestLabelKind | null {
  if (value === "ammo" || value === "kurazh" || value === "track") return value;
  return null;
}

function parsePrintKind(value: unknown): TestPrintKind | null {
  if (value === "brand" || value === "track") return value;
  return null;
}

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, message: "Нужен PIN админки" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    brand?: unknown;
  };

  const printer = await detectBarcodePrinter();
  if (!printer) {
    return NextResponse.json(
      { ok: false, message: "Принтер не настроен в CUPS" },
      { status: 500 },
    );
  }

  try {
    const printKind = parsePrintKind(body.kind);
    const brand = parseTestBrand(body.brand);

    if (printKind && brand) {
      const format = await printTestLabel(printer, printKind, brand);
      return NextResponse.json({
        ok: true,
        kind: printKind,
        brand,
        printer,
        format,
      });
    }

    // Старый формат: { kind: "ammo" | "kurazh" | "track" }
    const legacy = parseLegacyKind(body.kind);
    if (legacy) {
      const format = await printLabelTemplate(printer, legacy);
      const resolvedBrand: TestTrackBrand =
        legacy === "track" ? "casher" : legacy;
      return NextResponse.json({
        ok: true,
        kind: legacy === "track" ? "track" : "brand",
        brand: resolvedBrand,
        printer,
        format,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: "Укажи kind: brand|track и brand: casher|ammo|kurazh",
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        printer,
        message: error instanceof Error ? error.message : "Не удалось напечатать",
      },
      { status: 500 },
    );
  }
}
