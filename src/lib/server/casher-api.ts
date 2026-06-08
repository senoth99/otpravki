export const ORDERS_API_BASE =
  process.env.ORDERS_API_URL?.replace(/\/$/, "") ??
  process.env.CASHER_API_URL?.replace(/\/$/, "") ??
  "https://api.stage.cashercollection.com";

export function getCasherApiKey(): string | undefined {
  return process.env.CASHER_API_KEY?.trim() || process.env.api?.trim() || undefined;
}

export function casherAuthHeaders(): HeadersInit {
  const key = getCasherApiKey();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}
