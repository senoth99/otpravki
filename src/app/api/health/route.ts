import { NextResponse } from "next/server";
import { detectBarcodePrinter } from "@/lib/server/barcode-printer";

export async function GET() {
  const printer = await detectBarcodePrinter();
  return NextResponse.json({
    ok: true,
    service: "otpravki",
    syncApi: Boolean(process.env.SYNC_API_URL),
    printer: printer ?? null,
    time: new Date().toISOString(),
  });
}
