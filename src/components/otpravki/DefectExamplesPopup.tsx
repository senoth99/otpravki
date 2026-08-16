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
      <div className="safe-top flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-white">Виды брака</p>
          <p className="text-xs text-white/50">Примеры из регламента качества</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-3xl leading-none text-white active:bg-white/20"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          {QUALITY_GUIDE_EXAMPLES.map((example) => (
            <article
              key={example.id}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
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
              <div className="space-y-1 px-4 py-3.5">
                <h3 className="text-base font-semibold leading-snug text-white">
                  {example.title}
                </h3>
                <p className="text-sm leading-snug text-white/55">{example.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="h-6 safe-bottom" />
      </div>
    </div>
  );
}
