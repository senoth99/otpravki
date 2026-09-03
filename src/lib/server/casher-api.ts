import { listStoredBrands } from "@/lib/server/brands-store";

export const ORDERS_API_BASE =
  process.env.ORDERS_API_URL?.replace(/\/$/, "") ??
  process.env.CASHER_API_URL?.replace(/\/$/, "") ??
  "https://api.amarix.ru";

export interface BrandApiConfig {
  key: string;
  code: string;
  label: string;
  token: string;
}

function sanitizeApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  return trimmed || undefined;
}

/** Квадратные скобки — чтобы Next.js не «запекал» пустое значение при сборке */
export function getCasherApiKey(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  return (
    sanitizeApiKey(env.CASHER_API_KEY) ??
    sanitizeApiKey(env.api) ??
    sanitizeApiKey(env.API) ??
    undefined
  );
}

const BRAND_ENV: Array<Pick<BrandApiConfig, "key" | "code" | "label">> = [
  { key: "CASHER", code: "casher", label: "CASHER" },
  { key: "SHECASH", code: "shecash", label: "SHECASH" },
  { key: "AMMO", code: "ammo", label: "AMMO" },
  { key: "KURAZHDVIZH", code: "kurazhdvizh", label: "KURAZHDVIZH" },
];

export function getEnvBrandSeeds(): BrandApiConfig[] {
  const env = process.env as Record<string, string | undefined>;
  return BRAND_ENV.map((brand) => {
    const token =
      sanitizeApiKey(env[`ORDERS_API_TOKEN_${brand.key}`]) ??
      sanitizeApiKey(env[`CASHER_API_KEY_${brand.key}`]) ??
      undefined;
    if (!token) return null;
    return { ...brand, token };
  }).filter((brand): brand is BrandApiConfig => brand !== null);
}

/** Квадратные скобки — чтобы Next.js не «запекал» env при сборке */
export function getBrandApiConfigs(): BrandApiConfig[] {
  const env = process.env as Record<string, string | undefined>;
  const stored = listStoredBrands();
  const byKey = new Map<string, BrandApiConfig>();

  for (const brand of BRAND_ENV) {
    const token =
      sanitizeApiKey(env[`ORDERS_API_TOKEN_${brand.key}`]) ??
      sanitizeApiKey(env[`CASHER_API_KEY_${brand.key}`]) ??
      undefined;
    if (!token) continue;
    byKey.set(brand.key, { ...brand, token });
  }

  for (const brand of stored) {
    if (!brand.enabled) {
      byKey.delete(brand.key);
      continue;
    }
    byKey.set(brand.key, {
      key: brand.key,
      code: brand.code,
      label: brand.label,
      token: brand.token,
    });
  }

  return [...byKey.values()];
}

export function getBrandApiConfig(brandCodeOrLabel?: string): BrandApiConfig | undefined {
  if (!brandCodeOrLabel) return undefined;
  const normalized = brandCodeOrLabel.trim().toLowerCase();
  return getBrandApiConfigs().find(
    (brand) => brand.code === normalized || brand.label.toLowerCase() === normalized,
  );
}

export function casherAuthHeaders(key?: string): HeadersInit {
  const token = key ?? getCasherApiKey();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** /products без токена отдаёт пустой список — тогда в заказах остаются только гифты с sizeId. */
export function productsAuthHeaders(): HeadersInit {
  const brands = getBrandApiConfigs();
  const casher = brands.find((brand) => brand.key === "CASHER");
  return casherAuthHeaders(casher?.token ?? brands[0]?.token ?? getCasherApiKey());
}
