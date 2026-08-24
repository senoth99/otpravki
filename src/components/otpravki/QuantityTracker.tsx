"use client";

import { useRef, type PointerEvent } from "react";
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

/** Тап на планшете: pointerup надёжнее click внутри scroll-контейнера. */
function useTapAction(action: () => void, disabled: boolean) {
  const lastAt = useRef(0);
  const run = () => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastAt.current < 350) return;
    lastAt.current = now;
    action();
  };
  return {
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      run();
    },
    onClick: () => {
      run();
    },
  };
}

export function QuantityTracker({
  quantity,
  doneCount,
  onIncrement,
  onDecrement,
  incrementLabel = "Взял",
  doneLabel = "Собрано",
}: QuantityTrackerProps) {
  const isComplete = doneCount >= quantity;
  const dec = useTapAction(onDecrement, doneCount === 0);
  const inc = useTapAction(onIncrement, isComplete);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-36" data-no-drag-scroll>
      <QuantityProgress quantity={quantity} doneCount={doneCount} />

      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          {...dec}
          disabled={doneCount === 0}
          className="flex h-11 min-h-[44px] w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-600 transition-colors active:bg-gray-50 disabled:pointer-events-none disabled:border-transparent disabled:opacity-0"
          aria-label="Убрать одну штуку"
        >
          −1
        </button>

        <button
          type="button"
          {...inc}
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
