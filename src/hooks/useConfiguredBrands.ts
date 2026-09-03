"use client";

import { useEffect, useState } from "react";

export function useConfiguredBrands(): string[] {
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/brands", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; brands?: Array<{ label: string }> };
        if (cancelled || !data.ok) return;
        setLabels((data.brands ?? []).map((brand) => brand.label).filter(Boolean));
      } catch {
        // фильтры останутся по заказам
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return labels;
}
