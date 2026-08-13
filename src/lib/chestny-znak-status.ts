import { toGtin14 } from "@/lib/chestny-znak-gtin";

export const CHESTNY_ZNAK_LOW_THRESHOLD = 15;

export type ChestnyZnakStockStatus = "unset" | "empty" | "low" | "ok";

export function chestnyZnakStockStatus(
  chestnyZnak: string | null | undefined,
  remainingByGtin: Record<string, number> | null,
): { status: ChestnyZnakStockStatus; remaining: number | null; pending: boolean } {
  const gtin = toGtin14(chestnyZnak ?? "");
  if (!gtin) {
    return { status: "unset", remaining: null, pending: false };
  }
  if (!remainingByGtin) {
    return { status: "unset", remaining: null, pending: true };
  }
  const remaining = remainingByGtin[gtin] ?? 0;
  if (remaining <= 0) return { status: "empty", remaining, pending: false };
  if (remaining < CHESTNY_ZNAK_LOW_THRESHOLD) {
    return { status: "low", remaining, pending: false };
  }
  return { status: "ok", remaining, pending: false };
}
