import { NextResponse } from "next/server";
import { getWarehouseMap, saveWarehouseMap } from "@/lib/server/warehouse-map-store";
import type { WarehouseMapConfig } from "@/types/stock";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getWarehouseMap();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ошибка чтения карты склада" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray((body as Record<string, unknown>).cells)
    ) {
      return NextResponse.json(
        { ok: false, error: "Неверный формат: ожидается объект с полем cells (массив)" },
        { status: 400 },
      );
    }

    const config = body as WarehouseMapConfig;
    await saveWarehouseMap(config);
    const saved = await getWarehouseMap();
    return NextResponse.json({ ok: true, data: saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ошибка сохранения карты склада" },
      { status: 500 },
    );
  }
}
