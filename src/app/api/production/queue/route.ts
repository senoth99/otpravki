import { NextResponse } from "next/server";
import { fetchProductionQueue, getProductionBrandAuths } from "@/lib/server/production-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand")?.trim() || undefined;

  try {
    const items = await fetchProductionQueue(brand);
    const modes = getProductionBrandAuths().map((a) => ({
      brand: a.label,
      mode: a.facilityMode ? "production-api" : "products/production",
    }));
    return NextResponse.json({
      count: items.length,
      items,
      modes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка очереди производства";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
