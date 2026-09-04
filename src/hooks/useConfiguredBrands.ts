"use client";

import { useEffect, useState } from "react";

export function useConfiguredBrands(): string[] {
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/brands", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; brands?: Array<{ label: string }> };
        if (cancelled || !data.ok) return;
        setLabels((data.brands ?? []).map((brand) => brand.label).filter(Boolean));
      } catch {
        // фильтры останутся по заказам
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return labels;
}
