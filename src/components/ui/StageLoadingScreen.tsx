"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_STAGES = [
  "готовим заказы",
  "заливаемся энергетиками",
  "анализируем клиентов",
  "считаем носки в коробках",
  "договариваемся с курьером",
  "ещё чуть-чуть и полетели",
] as const;

export interface StageLoadingScreenProps {
  /** Полный экран (auth / route) или поверх контента */
  variant?: "fullscreen" | "overlay";
  /** Фиксированный прогресс 0–100; без него — плавная анимация */
  progress?: number;
  labels?: readonly string[];
  className?: string;
}

export function StageLoadingScreen({
  variant = "fullscreen",
  progress,
  labels = DEFAULT_STAGES,
  className = "",
}: StageLoadingScreenProps) {
  const [autoProgress, setAutoProgress] = useState(8);

  useEffect(() => {
    if (typeof progress === "number") return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - started;
      // Быстрый старт, потом замедление к ~92%
      const t = Math.min(1, elapsed / 12_000);
      const next = Math.round(8 + (84 * (1 - Math.pow(1 - t, 2.2))));
      setAutoProgress(next);
    }, 120);
    return () => window.clearInterval(id);
  }, [progress]);

  const value = typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : autoProgress;
  const stageIndex = useMemo(() => {
    if (labels.length <= 1) return 0;
    const idx = Math.floor((value / 100) * labels.length);
    return Math.min(labels.length - 1, idx);
  }, [labels, value]);
  const label = labels[stageIndex] ?? labels[0];

  const shell =
    variant === "overlay"
      ? "absolute inset-0 z-40 flex items-center justify-center bg-white/85 backdrop-blur-[2px]"
      : "flex min-h-dvh w-full items-center justify-center bg-gray-50";

  return (
    <div className={`${shell} ${className}`.trim()} role="status" aria-live="polite" aria-busy="true">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <p className="text-center text-base font-semibold text-gray-900 transition-opacity duration-300">
          {label}…
        </p>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gray-900 transition-[width] duration-200 ease-out"
            style={{ width: `${value}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs tabular-nums text-gray-400">{value}%</p>
      </div>
    </div>
  );
}
