"use client";

import { QuantityProgress } from "./QuantityProgress";

interface QuantityTrackerProps {
  quantity: number;
  doneCount: number;
  onIncrement: () => void;
  onDecrement: () => void;
  incrementLabel?: string;
  doneLabel?: string;
}

const BTN =
  "flex h-11 min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold uppercase tracking-wide transition-colors active:scale-[0.98] touch-manipulation";

export function QuantityTracker({
  quantity,
  doneCount,
  onIncrement,
  onDecrement,
  incrementLabel = "Взял",
  doneLabel = "Собрано",
}: QuantityTrackerProps) {
  const isComplete = doneCount >= quantity;

  return (
    <div className="flex w-full flex-col gap-2 sm:w-36" data-no-drag-scroll>
      <QuantityProgress quantity={quantity} doneCount={doneCount} />

      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={onDecrement}
          disabled={doneCount === 0}
          className="flex h-11 min-h-[44px] w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-600 transition-colors active:bg-gray-50 disabled:pointer-events-none disabled:border-transparent disabled:opacity-0"
          aria-label="Убрать одну штуку"
        >
          −1
        </button>

        <button
          type="button"
          onClick={(event) => {
            if ((event.nativeEvent as PointerEvent).pointerType === "touch") return;
            onIncrement();
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== "touch" || isComplete) return;
            event.preventDefault();
            onIncrement();
          }}
          disabled={isComplete}
          className={`${BTN} min-w-0 flex-1 ${
            isComplete
              ? "cursor-default bg-green-500 text-white"
              : "bg-gray-900 text-white active:bg-gray-800"
          }`}
        >
          {isComplete ? doneLabel : incrementLabel}
        </button>
      </div>
    </div>
  );
}
