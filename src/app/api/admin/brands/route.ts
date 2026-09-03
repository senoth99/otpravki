import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/server/admin-pin";
import { resolveBrandFromProductionToken } from "@/lib/server/brand-token-probe";
import {
  consumeBrandInvite,
  hasValidBrandInvite,
  listStoredBrands,
  maskedBrand,
  setStoredBrandEnabled,
  upsertStoredBrand,
} from "@/lib/server/brands-store";
import { getEnvBrandSeeds } from "@/lib/server/casher-api";

export const dynamic = "force-dynamic";

async function canMutateBrands(request: Request): Promise<{ ok: boolean; invite: string | null }> {
  if (await hasAdminAccess()) return { ok: true, invite: null };
  const url = new URL(request.url);
  const invite =
    url.searchParams.get("invite")?.trim() ||
    request.headers.get("x-brand-invite")?.trim() ||
    "";
  if (!invite) return { ok: false, invite: null };
  return { ok: await hasValidBrandInvite(invite), invite };
}

function mergedBrandList() {
  const stored = listStoredBrands();
  const byKey = new Map(stored.map((brand) => [brand.key, brand]));
  for (const seed of getEnvBrandSeeds()) {
    if (byKey.has(seed.key)) continue;
    byKey.set(seed.key, {
      key: seed.key,
      code: seed.code,
      label: seed.label,
      token: seed.token,
      enabled: true,
      createdAt: 0,
    });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

export async function GET() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN админки" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    brands: mergedBrandList().map(maskedBrand),
  });
}

export async function POST(request: Request) {
  const access = await canMutateBrands(request);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Введите токен производства" }, { status: 400 });
  }

  try {
    const ids = await resolveBrandFromProductionToken(token);
    const brand = await upsertStoredBrand({
      ...ids,
      token,
      enabled: true,
    });
    if (access.invite) await consumeBrandInvite(access.invite);
    void import("@/lib/server/workspace-api-sync")
      .then((mod) => mod.fetchAndSyncWorkspaceFromApi())
      .catch(() => undefined);
    return NextResponse.json({ ok: true, brand: maskedBrand(brand) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Не удалось добавить бренд" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN админки" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { key?: unknown; enabled?: unknown };
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key || typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "Нужны key и enabled" }, { status: 400 });
  }

  let brand = await setStoredBrandEnabled(key, body.enabled);
  if (!brand) {
    const seed = getEnvBrandSeeds().find(
      (entry) => entry.key === key || entry.code === key.toLowerCase() || entry.label === key,
    );
    if (!seed) {
      return NextResponse.json({ ok: false, error: "Бренд не найден" }, { status: 404 });
    }
    brand = await upsertStoredBrand({ ...seed, enabled: body.enabled });
  }

  return NextResponse.json({ ok: true, brand: maskedBrand(brand) });
}
