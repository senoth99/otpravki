"use client";

import type { ChestnyZnakStockStatus } from "@/lib/chestny-znak-status";

const STYLE: Record<ChestnyZnakStockStatus, string> = {
  unset: "bg-gray-300 text-gray-600",
  empty: "bg-red-500 text-white",
  low: "bg-amber-400 text-white",
  ok: "bg-green-500 text-white",
};

const LABEL: Record<ChestnyZnakStockStatus, string> = {
  unset: "Честный знак не настроен",
  empty: "Честные знаки закончились",
  low: "Честные знаки заканчиваются",
  ok: "Честный знак в наличии",
};

interface ChestnyZnakStatusIconProps {
  status: ChestnyZnakStockStatus;
  remaining?: number | null;
  pending?: boolean;
  /** Как ячейка количества: h-10 × min-w-10 */
  size?: "sm" | "md";
}

export function ChestnyZnakStatusIcon({
  status,
  remaining,
  pending,
  size = "sm",
}: ChestnyZnakStatusIconProps) {
  const title = pending
    ? "Загружаем остаток честного знака"
    : remaining != null && status !== "unset"
      ? `${LABEL[status]} · ${remaining}`
      : LABEL[status];

  const box =
    size === "md"
      ? "h-10 min-w-10 rounded-xl px-2 text-[11px]"
      : "h-5 min-w-5 rounded-md px-1 text-[9px]";

  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex shrink-0 items-center justify-center font-bold leading-none tracking-wide ${box} ${STYLE[status]} ${
        pending ? "animate-pulse" : ""
      }`}
    >
      ЧЗ
    </span>
  );
}
