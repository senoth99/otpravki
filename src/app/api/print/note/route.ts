import { NextResponse } from "next/server";
import { mkdir } from "fs/promises";
import path from "path";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { getGiftNoteImage, type GiftNoteLayout } from "@/lib/gift-note-presets";
import { buildGiftNotePdf } from "@/lib/server/gift-note-pdf";
import { detectBarcodePrinter } from "@/lib/server/barcode-printer";
import { printPdfLabel4x6 } from "@/lib/server/pdf-label-printer";
import { renderLabelPdfToPng } from "@/lib/server/render-label-preview";

export const maxDuration = 60;

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");

function parseLayout(value: unknown): GiftNoteLayout | undefined {
  if (
    value === "text" ||
    value === "image-left" ||
    value === "image-top" ||
    value === "image-only"
  ) {
    return value;
  }
  return undefined;
}

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as {
    text?: unknown;
    imageId?: unknown;
    layout?: unknown;
    copies?: unknown;
    preview?: unknown;
  };

  const text = typeof body.text === "string" ? body.text : "";
  const imageId =
    typeof body.imageId === "string" && body.imageId.trim()
      ? body.imageId.trim()
      : null;
  if (imageId && !getGiftNoteImage(imageId)) {
    return NextResponse.json({ ok: false, message: "Неизвестная картинка" }, { status: 400 });
  }

  const layout = parseLayout(body.layout);
  const copiesRaw = typeof body.copies === "number" ? body.copies : Number(body.copies);
  const copies = Number.isFinite(copiesRaw)
    ? Math.min(5, Math.max(1, Math.round(copiesRaw)))
    : 1;

  try {
    const pdf = await buildGiftNotePdf({ text, imageId, layout });

    if (body.preview === true) {
      const png = await renderLabelPdfToPng(pdf);
      return new NextResponse(new Uint8Array(png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        },
      });
    }

    if (!text.trim() && !imageId) {
      return NextResponse.json(
        { ok: false, message: "Добавь текст или картинку" },
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

    await mkdir(PRINT_DIR, { recursive: true });
    const stampBase = `note-${Date.now()}`;
    let format: string = "tspl";
    for (let i = 0; i < copies; i += 1) {
      format = await printPdfLabel4x6(printer, pdf, PRINT_DIR, `${stampBase}-${i + 1}`);
    }

    return NextResponse.json({ ok: true, printer, format, copies });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось напечатать записку",
      },
      { status: 500 },
    );
  }
}
