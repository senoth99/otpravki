import { NextResponse } from "next/server";
import { getProductsWithCache } from "@/lib/server/product-cache";

export async function GET() {
  try {
    const { products, source } = await getProductsWithCache();
    return NextResponse.json({ products, source });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка загрузки" },
      { status: 503 },
    );
  }
}
