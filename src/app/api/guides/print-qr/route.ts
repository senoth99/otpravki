import { mkdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { detectBarcodePrinter } from "@/lib/server/barcode-printer";
import { buildGuideQrLabelPdf } from "@/lib/server/guide-qr-label-pdf";
import { getGuide } from "@/lib/server/guides-store";
import { printPdfLabel4x6 } from "@/lib/server/pdf-label-printer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");

function sanitizeOrigin(raw: unknown, request: Request): string {
  if (typeof raw === "string") {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      /* fall through */
    }
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  return "http://192.168.1.100:3000";
}

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as {
    slug?: unknown;
    origin?: unknown;
  };
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    return NextResponse.json({ ok: false, message: "Нет темы" }, { status: 400 });
  }

  const guide = await getGuide(slug);
  if (!guide) {
    return NextResponse.json({ ok: false, message: "Тема не найдена" }, { status: 404 });
  }

  const origin = sanitizeOrigin(body.origin, request);
  const url = `${origin}/gaidy/${guide.slug}`;

  try {
    const printer = await detectBarcodePrinter();
    if (!printer) {
      return NextResponse.json(
        { ok: false, message: "Принтер не настроен в CUPS" },
        { status: 500 },
      );
    }

    const pdf = await buildGuideQrLabelPdf({
      title: guide.title,
      subtitle: guide.subtitle,
      url,
    });

    await mkdir(PRINT_DIR, { recursive: true });
    const format = await printPdfLabel4x6(
      printer,
      pdf,
      PRINT_DIR,
      `guide-qr-${guide.slug}-${Date.now()}`,
    );

    return NextResponse.json({
      ok: true,
      printer,
      format,
      url,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось напечатать QR",
      },
      { status: 500 },
    );
  }
}
