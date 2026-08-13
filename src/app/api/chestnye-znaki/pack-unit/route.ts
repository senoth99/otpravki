import { NextResponse } from "next/server";
import { gtinsMatch, toGtin14 } from "@/lib/chestny-znak-gtin";
import { requireUserSession } from "@/lib/server/auth-session";
import {
  searchActiveKm,
  writeOffKm,
  type KmRecord,
} from "@/lib/server/chestny-znak-crpt-client";
import {
  appendPackEvent,
  claimCis,
  listUsedCis,
  releaseCis,
  withPackLock,
} from "@/lib/server/chestny-znak-pack-store";
import { invalidateChestnyZnakRemainingCache } from "@/lib/server/chestny-znak-remaining";
import { isChestnyZnakPackingEnabled } from "@/lib/server/chestny-znak-settings";
import { printKmLabel } from "@/lib/server/km-label-printer";

function isFreeMatch(row: KmRecord, gtin: string, used: Set<string>, requireGtin: boolean) {
  if (!row.cis || used.has(row.cis)) return false;
  if (row.gtin) return gtinsMatch(row.gtin, gtin);
  return !requireGtin;
}

async function findFreeKm(gtin: string): Promise<KmRecord | null> {
  const used = await listUsedCis();

  try {
    const filtered = await searchActiveKm({ gtin, perPage: 100, maxPages: 8 });
    const match = filtered.items.find((row) => isFreeMatch(row, gtin, used, false));
    if (match) return match;
  } catch {
    // True API может не принять gtins — ищем среди INTRODUCED и фильтруем сами
  }

  const fallback = await searchActiveKm({ perPage: 100, maxPages: 15 });
  return fallback.items.find((row) => isFreeMatch(row, gtin, used, true)) ?? null;
}

export async function POST(request: Request) {
  const session = await requireUserSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    gtin?: string;
    orderId?: string;
    itemId?: string;
    productId?: string;
    productName?: string;
  };

  if (!(await isChestnyZnakPackingEnabled())) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const gtin = toGtin14(body.gtin ?? "");
  if (!gtin) {
    return NextResponse.json({ ok: false, error: "Не указан код честного знака" }, { status: 400 });
  }

  const baseEvent = {
    ts: Date.now(),
    gtin,
    productId: body.productId,
    productName: body.productName,
    orderId: body.orderId,
    itemId: body.itemId,
  };

  let claimedCis: string | null = null;
  let printedOk = false;

  try {
    const km = await withPackLock(async () => {
      const found = await findFreeKm(gtin);
      if (!found?.cis) return null;
      const claimed = await claimCis(found.cis);
      return claimed ? found : null;
    });

    if (!km?.cis) {
      await appendPackEvent({
        ...baseEvent,
        ok: false,
        error: "Нет свободного КМ для этого товара",
      });
      return NextResponse.json(
        { ok: false, error: "Нет свободного честного знака для этой позиции" },
        { status: 409 },
      );
    }

    claimedCis = km.cis;
    invalidateChestnyZnakRemainingCache();

    const printed = await printKmLabel({ cis: km.cis, gtin: km.gtin ?? gtin });
    if (!printed.ok) {
      await releaseCis(km.cis);
      claimedCis = null;
      invalidateChestnyZnakRemainingCache();
      await appendPackEvent({
        ...baseEvent,
        ok: false,
        cis: km.cis,
        error: printed.error ?? "Ошибка печати",
      });
      return NextResponse.json(
        { ok: false, error: printed.error ?? "Не удалось напечатать честный знак" },
        { status: 502 },
      );
    }

    printedOk = true;

    const written = await writeOffKm([km.cis], {
      docNum: `PACK-${body.orderId ?? "order"}-${Date.now()}`,
    });

    await appendPackEvent({
      ...baseEvent,
      ok: true,
      cis: km.cis,
      docId: written.docId,
    });

    return NextResponse.json({
      ok: true,
      cis: km.cis,
      gtin,
      printer: printed.printer,
      docId: written.docId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка честного знака";
    if (claimedCis && !printedOk) {
      await releaseCis(claimedCis).catch(() => undefined);
      invalidateChestnyZnakRemainingCache();
    }
    await appendPackEvent({
      ...baseEvent,
      ok: false,
      cis: claimedCis ?? undefined,
      error: message,
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
