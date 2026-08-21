import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/server/admin-pin";
import { getBoxLabelBrand, type BoxLabelBrandId } from "@/lib/box-label-brands";
import { getBrandSiteLogo } from "@/lib/server/brand-site-logo";

export const maxDuration = 30;

export async function GET(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, error: "Нужен PIN админки" }, { status: 401 });
  }

  const brandId = new URL(request.url).searchParams.get("brand");
  if (!brandId || !getBoxLabelBrand(brandId)) {
    return NextResponse.json(
      { ok: false, error: "Укажи brand=casher|ammo|kurazh|shecash" },
      { status: 400 },
    );
  }

  try {
    const logo = await getBrandSiteLogo(brandId as BoxLabelBrandId);
    return new NextResponse(new Uint8Array(logo.png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
        "X-Logo-Source": logo.sourceUrl,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Не удалось скачать логотип",
      },
      { status: 502 },
    );
  }
}
