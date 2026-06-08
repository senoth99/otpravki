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
      return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 400 });
    }

    const printer = await detectBarcodePrinter();
    const printed = await printToBarcodePrinter(body.orderNumber, body.barcodeData);
    if (!printed) {
      return NextResponse.json({ ok: false, reason: "print_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, method: "server", printer });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "print_error" },
      { status: 500 },
    );
  }
}
