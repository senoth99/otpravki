"use client";

interface QuantityProgressProps {
  quantity: number;
  doneCount: number;
}

export function QuantityProgress({ quantity, doneCount }: QuantityProgressProps) {
  const total = Math.max(quantity, 1);

  return (
    <div className="flex w-full items-center gap-2">
      <div
        className="flex h-3 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-lg bg-gray-300/80 p-[2px]"
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`min-w-0 flex-1 transition-colors ${
              i === 0 ? "rounded-l-[5px]" : ""
            } ${i === total - 1 ? "rounded-r-[5px]" : ""} ${
              i < doneCount ? "bg-green-500" : "bg-white"
            }`}
          />
        ))}
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-gray-500">
        {doneCount}/{total}
      </span>
    </div>
  );
}
