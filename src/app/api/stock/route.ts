import { NextResponse } from "next/server";
import { fetchWarehouseStock } from "@/lib/server/stock-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchWarehouseStock();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ошибка получения остатков" },
      { status: 500 },
    );
  }
}
