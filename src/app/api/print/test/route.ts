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
import { detectBarcodePrinter, getPrinterDiagnostics } from "@/lib/server/barcode-printer";
import { printTestKmLabel } from "@/lib/server/km-label-printer";

export const maxDuration = 60;

function parseLegacyKind(value: unknown): TestLabelKind | null {
  if (value === "ammo" || value === "kurazh" || value === "track") return value;
  return null;
}

function parsePrintKind(value: unknown): TestPrintKind | "chestny-znak" | null {
  if (value === "brand" || value === "track" || value === "chestny-znak") return value;
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
    printer?: unknown;
  };

  const diagnostics = await getPrinterDiagnostics();
  const requested = typeof body.printer === "string" ? body.printer.trim() : "";
  const printKind = parsePrintKind(body.kind);

  if (printKind === "chestny-znak") {
    try {
      const satoRequested =
        requested && /ws408|sato|sepl/i.test(requested) ? requested : null;
      const brand = parseTestBrand(body.brand);
      const result = await printTestKmLabel(satoRequested, brand);
      if (!result.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: result.error ?? "Не удалось напечатать честный знак",
            printer: result.printer,
            printers: diagnostics.printers,
          },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        kind: "chestny-znak",
        brand: result.brandId,
        printer: result.printer,
        format: result.format,
        gtin: result.gtin,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Не удалось напечатать",
        },
        { status: 500 },
      );
    }
  }

  let printer: string | null = null;
  if (requested) {
    if (!diagnostics.printers.includes(requested)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Принтер «${requested}» не найден в CUPS`,
          printers: diagnostics.printers,
        },
        { status: 400 },
      );
    }
    printer = requested;
  } else {
    printer = diagnostics.printer ?? (await detectBarcodePrinter());
  }

  if (!printer) {
    return NextResponse.json(
      {
        ok: false,
        message: "Принтер не настроен в CUPS",
        printers: diagnostics.printers,
      },
      { status: 500 },
    );
  }

  try {
    const brand = parseTestBrand(body.brand);

    if (printKind && brand && (printKind === "brand" || printKind === "track")) {
      const format = await printTestLabel(printer, printKind, brand);
      return NextResponse.json({
        ok: true,
        kind: printKind,
        brand,
        printer,
        format,
      });
    }

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
        message: "Укажи kind: brand|track|chestny-znak и brand при необходимости",
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
