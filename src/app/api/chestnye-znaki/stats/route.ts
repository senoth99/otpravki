import { NextResponse } from "next/server";
import { toGtin14 } from "@/lib/chestny-znak-gtin";
import { fetchProducts } from "@/lib/api";
import { searchActiveKm } from "@/lib/server/chestny-znak-crpt-client";
import { hasChestnyZnakPinAccess } from "@/lib/server/chestny-znak-pin";
import { listUsedCis, loadPackEvents } from "@/lib/server/chestny-znak-pack-store";

export interface ChestnyZnakSkuStat {
  gtin: string;
  productName: string;
  remaining: number;
  writtenOff: number;
  failed: number;
}

export async function GET() {
  if (!(await hasChestnyZnakPinAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN" }, { status: 401 });
  }

  try {
    const [events, used, kmSearch, products] = await Promise.all([
      loadPackEvents(),
      listUsedCis(),
      searchActiveKm({ perPage: 100, maxPages: 20 }),
      fetchProducts().catch(() => []),
    ]);

    const names = new Map<string, string>();
    const productById = new Map(products.map((product) => [product.slug, product.name]));

    const remaining = new Map<string, number>();
    for (const row of kmSearch.items) {
      if (!row.cis || used.has(row.cis)) continue;
      const gtin = toGtin14(row.gtin ?? "");
      if (!gtin) continue;
      remaining.set(gtin, (remaining.get(gtin) ?? 0) + 1);
    }

    const writtenOff = new Map<string, number>();
    const failed = new Map<string, number>();
    for (const event of events) {
      const gtin = toGtin14(event.gtin);
      if (!gtin) continue;
      if (event.productName?.trim()) names.set(gtin, event.productName.trim());
      const catalogName = event.productId ? productById.get(event.productId) : undefined;
      if (catalogName) names.set(gtin, catalogName);
      if (event.ok) {
        writtenOff.set(gtin, (writtenOff.get(gtin) ?? 0) + 1);
      } else {
        failed.set(gtin, (failed.get(gtin) ?? 0) + 1);
      }
    }

    const gtins = new Set([...remaining.keys(), ...writtenOff.keys(), ...failed.keys()]);
    const rows: ChestnyZnakSkuStat[] = [...gtins]
      .map((gtin) => ({
        gtin,
        productName: names.get(gtin) || `GTIN ${gtin}`,
        remaining: remaining.get(gtin) ?? 0,
        writtenOff: writtenOff.get(gtin) ?? 0,
        failed: failed.get(gtin) ?? 0,
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, "ru"));

    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка статистики",
      },
      { status: 502 },
    );
  }
}
