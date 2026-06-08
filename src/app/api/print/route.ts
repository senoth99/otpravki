import { NextResponse } from "next/server";
import {
  detectBarcodePrinter,
  printToBarcodePrinter,
} from "@/lib/server/barcode-printer";

export async function GET() {
  const printer = await detectBarcodePrinter();
  return NextResponse.json({
    ok: Boolean(printer),
    printer: printer ?? null,
    auto: !process.env.BARCODE_PRINTER?.trim(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      orderNumber?: string;
      barcodeData?: string;
    };

    if (!body.orderNumber || !body.barcodeData) {
      return NextResponse.json(
        { ok: false, reason: "invalid_payload", message: "Некорректные данные заказа" },
        { status: 400 },
      );
    }

    const result = await printToBarcodePrinter(body.orderNumber, body.barcodeData);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: "print_failed",
          message: result.error ?? "Не удалось напечатать",
          printer: result.printer ?? null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      method: "server",
      printer: result.printer,
      format: result.format,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "print_error",
        message: error instanceof Error ? error.message : "Ошибка печати",
      },
      { status: 500 },
    );
  }
}
