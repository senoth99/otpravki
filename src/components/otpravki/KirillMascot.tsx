"use client";

import { useEffect, useState } from "react";

interface KirillMascotProps {
  itemCount: number;
}

function pluralTovarov(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "ТОВАРОВ";
  if (last === 1) return "ТОВАР";
  if (last >= 2 && last <= 4) return "ТОВАРА";
  return "ТОВАРОВ";
}

export function KirillMascot({ itemCount }: KirillMascotProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Кирилл"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 border-gray-900 bg-white text-2xl font-black text-gray-900 shadow-lg transition-transform active:scale-95 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
      >
        ?
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Кирилл"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-w-[min(100%,420px)] flex-col items-end gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => setOpen(false)}
              className="absolute -top-1 right-0 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold text-gray-700 shadow"
            >
              ×
            </button>

            <div className="mr-4 max-w-[280px] rounded-2xl rounded-br-md border border-gray-200 bg-white px-4 py-3 shadow-xl sm:mr-8 sm:max-w-[320px]">
              <p className="text-sm font-black uppercase leading-snug tracking-wide text-gray-900 sm:text-base">
                НУ ПИЗ*Ц, У НАС{" "}
                <span className="text-red-600 tabular-nums">{itemCount}</span>{" "}
                {pluralTovarov(itemCount)} К ОТПРАВКЕ
              </p>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mascots/kirill.png"
              alt="Кирилл"
              className="pointer-events-none h-auto w-[min(72vw,280px)] -scale-x-100 select-none drop-shadow-2xl sm:w-[320px]"
              draggable={false}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
