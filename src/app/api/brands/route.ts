import { NextResponse } from "next/server";
import { getBrandApiConfigs } from "@/lib/server/casher-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const brands = getBrandApiConfigs().map((brand) => ({
    key: brand.key,
    code: brand.code,
    label: brand.label,
  }));
  return NextResponse.json({ ok: true, brands });
}
