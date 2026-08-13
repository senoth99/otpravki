"use client";

import { toGtin14 } from "@/lib/chestny-znak-gtin";

export interface GtinProductInfo {
  productName: string;
  size: string;
}

interface GtinProductLabelProps {
  gtin?: string | null;
  catalog: Record<string, GtinProductInfo>;
  compact?: boolean;
}

export function GtinProductLabel({ gtin, catalog, compact }: GtinProductLabelProps) {
  const normalized = toGtin14(gtin ?? "");
  const info = normalized ? catalog[normalized] : undefined;

  if (!info) {
    return (
      <p className={`font-mono font-semibold text-gray-900 ${compact ? "text-xs" : "text-sm"}`}>
        {gtin?.trim() || "—"}
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <p className={`font-semibold text-gray-900 ${compact ? "text-xs" : "text-sm"}`}>
        {info.productName}
        {info.size ? <span className="font-medium text-gray-600"> · {info.size}</span> : null}
      </p>
      {normalized ? (
        <p className="mt-0.5 font-mono text-[10px] leading-none text-gray-300/80">{normalized}</p>
      ) : null}
    </div>
  );
}
