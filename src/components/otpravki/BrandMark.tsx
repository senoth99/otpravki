"use client";

import { useState } from "react";
import { boxLabelBrandIdFromStoreBrand } from "@/lib/box-label-brands";
import { getStoreBrand } from "@/lib/store-brand";

const FALLBACK: Record<string, { letter: string; className: string }> = {
  casher: { letter: "C", className: "bg-gray-950 text-white" },
  ammo: { letter: "A", className: "bg-orange-600 text-white" },
  kurazh: { letter: "К", className: "bg-zinc-800 text-white" },
  shecash: { letter: "S", className: "bg-violet-700 text-white" },
};

interface BrandMarkProps {
  brand?: string | null;
  className?: string;
  size?: "sm" | "md";
}

export function BrandMark({ brand, className = "", size = "sm" }: BrandMarkProps) {
  const [failed, setFailed] = useState(false);
  const label = getStoreBrand(brand);
  const id = boxLabelBrandIdFromStoreBrand(label);
  const fallback = (id && FALLBACK[id]) || {
    letter: label.slice(0, 1).toUpperCase() || "?",
    className: "bg-gray-700 text-white",
  };
  const box = size === "md" ? "h-7 w-7" : "h-5 w-5";
  const text = size === "md" ? "text-[11px]" : "text-[9px]";

  return (
    <span
      title={label}
      aria-label={label}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10 ${box} ${className}`}
    >
      {!failed && id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/brand-logo?brand=${encodeURIComponent(label)}`}
          alt=""
          draggable={false}
          className="h-full w-full object-contain p-0.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={`flex h-full w-full items-center justify-center font-bold leading-none ${text} ${fallback.className}`}>
          {fallback.letter}
        </span>
      )}
    </span>
  );
}
