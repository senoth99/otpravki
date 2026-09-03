import { ORDERS_API_BASE, casherAuthHeaders } from "@/lib/server/casher-api";
import { brandIdsFromRaw } from "@/lib/server/brands-store";
import { externalFetch } from "@/lib/server/external-fetch";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

async function fetchJson(
  path: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${ORDERS_API_BASE}${path}`;
  try {
    const res = await externalFetch(url, {
      headers: { ...casherAuthHeaders(token), Accept: "application/json" },
      cache: "no-store",
      timeoutMs: 15_000,
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function extractBrandName(data: unknown): string | null {
  const rec = asRecord(data);
  if (!rec) return null;
  const facility = asRecord(rec.facility);
  const brand = asRecord(rec.brand);
  return pickText(
    rec.brand_code,
    rec.brandCode,
    rec.brand,
    rec.code,
    rec.name,
    rec.label,
    facility?.brand_code,
    facility?.brandCode,
    facility?.code,
    facility?.name,
    brand?.code,
    brand?.name,
    brand?.label,
  );
}

function extractFromList(data: unknown): string | null {
  const rec = asRecord(data);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(rec?.items)
      ? rec.items
      : Array.isArray(rec?.orders)
        ? rec.orders
        : Array.isArray(rec?.products)
          ? rec.products
          : [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) continue;
    const name = pickText(
      item.brand_code,
      item.brandCode,
      item.brand,
      item.storeBrand,
      item.store_brand,
    );
    if (name) return name;
  }
  return null;
}

export async function resolveBrandFromProductionToken(token: string): Promise<{
  key: string;
  code: string;
  label: string;
}> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Введите токен производства");
  }

  const me = await fetchJson("/production-api/me", trimmed);
  const fromMe = extractBrandName(me.data);

  const products = await fetchJson("/products", trimmed);
  const fromProducts = extractFromList(products.data) ?? extractBrandName(products.data);

  const unshipped = await fetchJson("/orders/admin/unshipped-with-stock", trimmed);
  const fromOrders = extractFromList(unshipped.data);

  const raw = fromMe ?? fromProducts ?? fromOrders;
  if (!raw) {
    if (me.status === 401 && products.status === 401 && unshipped.status === 401) {
      throw new Error("Неверный или неактивный токен");
    }
    throw new Error("Токен принят API, но бренд не определился — проверь ключ в Amarix");
  }

  return brandIdsFromRaw(raw);
}
