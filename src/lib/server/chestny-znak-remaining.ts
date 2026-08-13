import { toGtin14 } from "@/lib/chestny-znak-gtin";
import { searchActiveKm } from "@/lib/server/chestny-znak-crpt-client";
import { listUsedCis } from "@/lib/server/chestny-znak-pack-store";

const CACHE_TTL_MS = 30_000;

let cache: { at: number; remaining: Record<string, number> } | null = null;
let inflight: Promise<Record<string, number>> | null = null;

export function invalidateChestnyZnakRemainingCache(): void {
  cache = null;
}

async function fetchRemainingByGtin(): Promise<Record<string, number>> {
  const [used, kmSearch] = await Promise.all([
    listUsedCis(),
    searchActiveKm({ perPage: 100, maxPages: 20 }),
  ]);

  const remaining: Record<string, number> = {};
  for (const row of kmSearch.items) {
    if (!row.cis || used.has(row.cis)) continue;
    const gtin = toGtin14(row.gtin ?? "");
    if (!gtin) continue;
    remaining[gtin] = (remaining[gtin] ?? 0) + 1;
  }
  return remaining;
}

export async function getRemainingByGtin(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.remaining;
  }
  if (!inflight) {
    inflight = fetchRemainingByGtin()
      .then((remaining) => {
        cache = { at: Date.now(), remaining };
        return remaining;
      })
      .finally(() => {
        inflight = null;
      });
  }

  try {
    return await inflight;
  } catch (error) {
    if (cache) return cache.remaining;
    throw error;
  }
}
