import { NextResponse } from "next/server";
import {
  boxLabelBrandIdFromStoreBrand,
  type BoxLabelBrandId,
} from "@/lib/box-label-brands";
import { getBrandSiteLogo } from "@/lib/server/brand-site-logo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("brand")?.trim() ?? "";
  const brandId = boxLabelBrandIdFromStoreBrand(raw) as BoxLabelBrandId | null;
  if (!brandId) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const logo = await getBrandSiteLogo(brandId);
    return new NextResponse(new Uint8Array(logo.png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Logo-Source": logo.sourceUrl,
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
