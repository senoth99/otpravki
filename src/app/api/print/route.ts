import { NextResponse } from "next/server";
import {
  getPrinterDiagnostics,
  printToBarcodePrinter,
} from "@/lib/server/barcode-printer";
import { markOrderShipped } from "@/lib/server/orders-api";

export const maxDuration = 60;

export async function GET() {
  const info = await getPrinterDiagnostics();
  return NextResponse.json({
    ok: Boolean(info.printer),
    printer: info.printer,
    defaultPrinter: info.defaultPrinter,
    printers: info.printers,
    auto: !process.env.BARCODE_PRINTER?.trim(),
    hint: info.hint,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      orderNumber?: string;
      orderId?: string;
      barcodeData?: string;
      barcodeUrl?: string;
    };

    if (!body.orderNumber) {
      return NextResponse.json(
        { ok: false, reason: "invalid_payload", message: "Некорректные данные заказа" },
        { status: 400 },
      );
    }

    if (!body.orderId?.trim()) {
      return NextResponse.json(
        { ok: false, reason: "missing_order_id", message: "Нет ID заказа для смены статуса в Casher" },
        { status: 400 },
      );
    }

    try {
      await markOrderShipped(body.orderId.trim());
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          reason: "status_update_failed",
          message:
            error instanceof Error
              ? error.message
              : "Не удалось отметить заказ отправленным в Casher",
        },
        { status: 502 },
      );
    }

    const result = await printToBarcodePrinter(body.orderNumber, {
      orderId: body.orderId,
      barcodeUrl: body.barcodeUrl,
      barcodeData: body.barcodeData,
    });
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
