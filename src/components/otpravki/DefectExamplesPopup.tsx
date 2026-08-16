"use client";

import { QUALITY_GUIDE_EXAMPLES } from "@/lib/quality-guide";

export function DefectExamplesPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[96] flex flex-col overflow-hidden bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-label="Виды брака"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-3xl leading-none text-white safe-top active:bg-white/20"
      >
        ×
      </button>

      <div className="grid h-full min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-2 p-2 pt-12 sm:gap-3 sm:p-3 sm:pt-14">
        {QUALITY_GUIDE_EXAMPLES.map((example) => (
          <article
            key={example.id}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
          >
            <div className="relative min-h-0 flex-1 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={example.imageUrl}
                alt={example.title}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            </div>
            <div className="flex h-12 shrink-0 flex-col justify-center px-2 py-1.5 sm:h-14 sm:px-2.5 sm:py-2">
              <h3 className="truncate text-[11px] font-semibold leading-tight text-white sm:text-sm">
                {example.title}
              </h3>
              <p className="mt-0.5 truncate text-[10px] leading-tight text-white/55 sm:text-xs">
                {example.detail}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
