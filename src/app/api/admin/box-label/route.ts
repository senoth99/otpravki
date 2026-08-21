import { NextResponse } from "next/server";
import { mkdir } from "fs/promises";
import path from "path";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { hasAdminAccess } from "@/lib/server/admin-pin";
import { getBoxLabelBrand, type BoxLabelBrandId } from "@/lib/box-label-brands";
import { buildBoxLabelPdf } from "@/lib/server/box-label-pdf";
import { detectBarcodePrinter } from "@/lib/server/barcode-printer";
import { printPdfLabel4x6 } from "@/lib/server/pdf-label-printer";

export const maxDuration = 60;

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");

function parseBrandId(value: unknown): BoxLabelBrandId | null {
  if (typeof value !== "string") return null;
  return getBoxLabelBrand(value) ? (value as BoxLabelBrandId) : null;
}

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, message: "Нужен PIN админки" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    brandId?: unknown;
    category?: unknown;
    name?: unknown;
    color?: unknown;
    size?: unknown;
    preview?: unknown;
  };

  const brandId = parseBrandId(body.brandId);
  if (!brandId) {
    return NextResponse.json(
      { ok: false, message: "Укажи brandId: casher|ammo|kurazh|shecash" },
      { status: 400 },
    );
  }

  const input = {
    brandId,
    category: typeof body.category === "string" ? body.category : "",
    name: typeof body.name === "string" ? body.name : "",
    color: typeof body.color === "string" ? body.color : "",
    size: typeof body.size === "string" ? body.size : "",
  };

  try {
    const pdf = await buildBoxLabelPdf(input);

    if (body.preview === true) {
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="box-label-${brandId}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const printer = await detectBarcodePrinter();
    if (!printer) {
      return NextResponse.json(
        { ok: false, message: "Принтер не настроен в CUPS" },
        { status: 500 },
      );
    }

    await mkdir(PRINT_DIR, { recursive: true });
    const format = await printPdfLabel4x6(
      printer,
      pdf,
      PRINT_DIR,
      `box-${brandId}-${Date.now()}`,
    );

    return NextResponse.json({
      ok: true,
      brandId,
      printer,
      format,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось сделать надпись",
      },
      { status: 500 },
    );
  }
}
