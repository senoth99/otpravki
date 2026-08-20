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

/** Квадратные скобки — чтобы Next.js не «запекал» env при сборке */
export function getBrandApiConfigs(): BrandApiConfig[] {
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
