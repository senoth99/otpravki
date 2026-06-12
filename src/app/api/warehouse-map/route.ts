import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { getWarehouseMap, saveWarehouseMap } from "@/lib/server/warehouse-map-store";
import type { FurnitureItem, WarehouseCell, WarehouseMapConfig } from "@/types/stock";

export const dynamic = "force-dynamic";

function isValidCell(cell: unknown): cell is WarehouseCell {
  if (!cell || typeof cell !== "object") return false;
  const c = cell as Record<string, unknown>;
  if (c.productSlug !== undefined && typeof c.productSlug !== "string") return false;
  if (c.productName !== undefined && typeof c.productName !== "string") return false;
  if (c.brand !== undefined && typeof c.brand !== "string") return false;
  if (c.label !== undefined && typeof c.label !== "string") return false;
  if (c.sizes !== undefined && (!Array.isArray(c.sizes) || !c.sizes.every((s) => typeof s === "string"))) return false;
  return true;
}

function isValidFurnitureItem(item: unknown): item is FurnitureItem {
  if (!item || typeof item !== "object") return false;
  const f = item as Record<string, unknown>;
  if (typeof f.id !== "string") return false;
  if (f.type !== "rack" && f.type !== "table") return false;
  if (typeof f.label !== "string") return false;
  if (typeof f.x !== "number" || typeof f.y !== "number") return false;
  if (typeof f.rows !== "number" || typeof f.cols !== "number") return false;
  if (f.rotation !== undefined && f.rotation !== "h" && f.rotation !== "v") return false;
  if (!f.cells || typeof f.cells !== "object" || Array.isArray(f.cells)) return false;
  for (const cell of Object.values(f.cells as Record<string, unknown>)) {
    if (!isValidCell(cell)) return false;
  }
  return true;
}

function isValidWarehouseMapConfig(body: unknown): body is WarehouseMapConfig {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.furniture)) return false;
  if (typeof b.updatedAt !== "number") return false;
  return b.furniture.every(isValidFurnitureItem);
}

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
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as unknown;

    if (!isValidWarehouseMapConfig(body)) {
      return NextResponse.json(
        { ok: false, error: "Неверный формат: ожидается объект с полями furniture (массив) и updatedAt (число)" },
        { status: 400 },
      );
    }

    await saveWarehouseMap(body);
    const saved = await getWarehouseMap();
    return NextResponse.json({ ok: true, data: saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ошибка сохранения карты склада" },
      { status: 500 },
    );
  }
}
