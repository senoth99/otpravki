"use client";

import { OrderNumberDisplay } from "./OrderNumberDisplay";

interface AutoModeCountdownProps {
  orderNumber: string;
  secondsLeft: number;
  totalSeconds: number;
  hasNext: boolean;
  /** print — ждём перед печатью; next — пауза перед следующим заказом */
  phase: "print" | "next";
  showExitAuto?: boolean;
  onExitAutoMode?: () => void;
}

export function AutoModeCountdown({
  orderNumber,
  secondsLeft,
  totalSeconds,
  hasNext,
  phase,
  showExitAuto = false,
  onExitAutoMode,
}: AutoModeCountdownProps) {
  const progress = ((totalSeconds - secondsLeft) / totalSeconds) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/90 p-6 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        {showExitAuto && (
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Auto Mode</p>
        )}
        <p className="mt-4 text-sm text-gray-300">
          {phase === "print" ? "Печать баркода и трека" : "Заказ отправлен"}
        </p>
        <p className="mt-1 text-2xl font-bold text-white">
          <OrderNumberDisplay orderNumber={orderNumber} className="justify-center" />
        </p>

        <div className="relative mt-10 flex h-32 w-32 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="white"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={339.292}
              strokeDashoffset={339.292 * (1 - progress / 100)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <span className="text-4xl font-bold tabular-nums text-white">{secondsLeft}</span>
        </div>

        <p className="mt-8 text-sm text-gray-400">
          {phase === "print"
            ? "Печать через…"
            : hasNext
              ? "Следующий заказ через…"
              : "Все заказы обработаны"}
        </p>

        {showExitAuto && onExitAutoMode && (
          <button
            type="button"
            onClick={onExitAutoMode}
            className="mt-8 w-full rounded-xl border border-gray-600 bg-gray-800 px-6 py-3 text-sm font-medium text-white transition-colors active:bg-gray-700"
          >
            Выключить AUTO MODE
          </button>
        )}
      </div>
    </div>
  );
}
