"use client";

import { useEffect, useState } from "react";

interface ShiftStartReminderProps {
  emoji?: string;
  onContinue: () => void;
}

const LOCK_MS = 7000;

const TASKS = [
  {
    n: 1,
    title: "ПРОВЕРЬ ВЕЩЬ",
    body: "Как на сайте: размер, комплект, принт, пятна, зацепки.",
  },
  {
    n: 2,
    title: "НЕ ПРОПУСКАЙ БРАК",
    body: "Сомневаешься — стоп. Не отправляй. Скажи руководителю.",
  },
  {
    n: 3,
    title: "ОТПРАВЛЯЙ ПО ПРИОРИТЕТУ",
    body: "Сначала критические, потом блогерские, потом всё остальное.",
  },
] as const;

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
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/70">
            Начало смены
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900">
            {emoji ? `${emoji} ` : ""}Привет! Перед стартом — коротко
          </h2>
          <p className="mt-1.5 text-sm leading-snug text-amber-950/85">
            Клиент получит ровно то, что ты собрал и отправил. Давай без косяков.
          </p>
        </div>

        <div className="min-h-0 flex-1 touch-scroll-y space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          <p className="rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-sm leading-snug text-sky-950">
            В списке только те заказы, которые можно отправить по текущему наличию на складе.
          </p>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Твои задачи
            </p>
            <ol className="space-y-2">
              {TASKS.map((task) => (
                <li
                  key={task.n}
                  className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-sm font-bold text-white">
                    {task.n}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      {task.title}
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-gray-600">{task.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
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
            {ready ? "Понял, продолжаем" : `Подожди ${secondsLeft}…`}
          </button>
        </div>
      </div>
    </div>
  );
}
