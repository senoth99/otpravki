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
}

export function ChestnyZnakStatusIcon({
  status,
  remaining,
  pending,
}: ChestnyZnakStatusIconProps) {
  const title = pending
    ? "Загружаем остаток честного знака"
    : remaining != null && status !== "unset"
      ? `${LABEL[status]} · ${remaining}`
      : LABEL[status];

  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[9px] font-bold leading-none tracking-wide ${STYLE[status]} ${
        pending ? "animate-pulse" : ""
      }`}
    >
      ЧЗ
    </span>
  );
}
