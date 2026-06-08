export const ORDERS_API_BASE =
  process.env.ORDERS_API_URL?.replace(/\/$/, "") ??
  process.env.CASHER_API_URL?.replace(/\/$/, "") ??
  "https://api.stage.cashercollection.com";

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

export function casherAuthHeaders(): HeadersInit {
  const key = getCasherApiKey();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}
