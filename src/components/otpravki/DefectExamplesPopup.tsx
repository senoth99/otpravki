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
      className="fixed inset-0 z-[96] flex flex-col bg-zinc-950"
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

      <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-3 py-4 pt-14 sm:px-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {QUALITY_GUIDE_EXAMPLES.map((example) => (
            <article
              key={example.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
            >
              <div className="relative aspect-[3/4] bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={example.imageUrl}
                  alt={example.title}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>
              <div className="space-y-0.5 px-2.5 py-2.5 sm:px-3 sm:py-3">
                <h3 className="text-sm font-semibold leading-snug text-white sm:text-base">
                  {example.title}
                </h3>
                <p className="text-xs leading-snug text-white/55 sm:text-sm">{example.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="h-6 safe-bottom" />
      </div>
    </div>
  );
}
