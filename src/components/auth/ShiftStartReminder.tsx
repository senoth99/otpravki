"use client";

import { useEffect, useState } from "react";

interface ShiftStartReminderProps {
  emoji?: string;
  onContinue: () => void;
}

const LOCK_MS = 7000;

export function ShiftStartReminder({ emoji, onContinue }: ShiftStartReminderProps) {
  const [leftMs, setLeftMs] = useState(LOCK_MS);

  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, LOCK_MS - (Date.now() - started));
      setLeftMs(left);
      if (left <= 0) window.clearInterval(tick);
    }, 100);
    return () => window.clearInterval(tick);
  }, []);

  const ready = leftMs <= 0;
  const secondsLeft = Math.ceil(leftMs / 1000);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/70">
            Начало смены
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900">
            {emoji ? `${emoji} ` : ""}Смотри на качество
          </h2>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-gray-700">
          <p className="text-base font-semibold leading-snug text-gray-900">
            Клиент получает ровно то, что ты собрал и отправил.
          </p>
          <ul className="space-y-2">
            <li className="rounded-2xl bg-gray-50 px-3.5 py-2.5">
              <strong className="text-gray-900">Эталон</strong> — как на сайте, без брака
            </li>
            <li className="rounded-2xl bg-gray-50 px-3.5 py-2.5">
              <strong className="text-gray-900">Проверь</strong> размер, комплект, принт, пятна,
              зацепки
            </li>
            <li className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 font-medium text-amber-950">
              Брак / сомнение — стоп, не отправляй, скажи руководителю
            </li>
          </ul>
        </div>

        <div className="space-y-2 border-t border-gray-100 p-4">
          <a
            href="/instrukciya"
            onClick={onContinue}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm font-medium text-gray-800 active:bg-gray-50"
          >
            Инструкция
          </a>
          <button
            type="button"
            disabled={!ready}
            onClick={onContinue}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-gray-900 text-sm font-medium text-white transition-opacity active:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ready ? "Продолжить" : `Подожди ${secondsLeft}…`}
          </button>
        </div>
      </div>
    </div>
  );
}
