"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { toLocalImageUrl } from "@/lib/image-url";
import { findTechSpecImages } from "@/lib/tech-specs";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  /** Имя товара — для кнопки «Технические характеристики» */
  productName?: string;
  /** Открывать крупный просмотр по нажатию (по умолчанию true) */
  previewable?: boolean;
}

export function ProductImage({
  src,
  alt,
  className,
  sizes,
  productName,
  previewable = true,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [specIndex, setSpecIndex] = useState(0);
  const imageSrc = toLocalImageUrl(src);
  const techImages = findTechSpecImages(productName || alt);
  const hasSpecs = Boolean(techImages?.length);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!open && !specsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (specsOpen) setSpecsOpen(false);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, specsOpen]);

  useEffect(() => {
    if (!specsOpen) setSpecIndex(0);
  }, [specsOpen]);

  if (!imageSrc || failed) {
    return (
      <div className={`flex items-center justify-center bg-gray-200 text-gray-400 ${className ?? ""}`}>
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  const canPreview = previewable;
  const label = productName || alt;

  return (
    <>
      <div
        role={canPreview ? "button" : undefined}
        tabIndex={canPreview ? 0 : undefined}
        onClick={(event) => {
          if (!canPreview) return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!canPreview) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
        aria-label={canPreview ? `Открыть фото: ${label}` : undefined}
        className={`absolute inset-0 block h-full w-full overflow-hidden p-0 ${
          canPreview ? "cursor-zoom-in active:opacity-90" : ""
        }`}
      >
        <Image
          src={imageSrc}
          alt={alt}
          fill
          unoptimized
          draggable={false}
          className={`select-none [-webkit-user-drag:none] ${className ?? ""}`}
          sizes={sizes}
          onError={() => setFailed(true)}
          onDragStart={(event) => event.preventDefault()}
        />
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="mx-auto flex w-fit max-w-full flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt={alt}
                className="block h-auto max-h-[min(70dvh,28rem)] max-w-full bg-transparent object-contain"
                draggable={false}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-2xl leading-none text-white active:bg-black/60"
              >
                ×
              </button>
            </div>
            <button
              type="button"
              disabled={!hasSpecs}
              onClick={() => {
                if (!hasSpecs) return;
                setSpecsOpen(true);
              }}
              className={`mt-3 flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold transition-colors ${
                hasSpecs
                  ? "bg-white text-gray-900 active:bg-gray-100"
                  : "cursor-not-allowed bg-white/25 text-white/50"
              }`}
            >
              Технические характеристики
            </button>
          </div>
        </div>
      ) : null}

      {specsOpen && techImages && techImages.length > 0 ? (
        <div
          className="fixed inset-0 z-[95] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="Технические характеристики"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 safe-top">
            <p className="min-w-0 truncate text-sm font-medium text-white/90">{label}</p>
            <button
              type="button"
              onClick={() => setSpecsOpen(false)}
              aria-label="Закрыть"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-3xl leading-none text-white active:bg-white/25"
            >
              ×
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={techImages[specIndex]}
              alt={`Технические характеристики: ${label}`}
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>

          {techImages.length > 1 ? (
            <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-3 safe-bottom">
              <button
                type="button"
                onClick={() =>
                  setSpecIndex((i) => (i <= 0 ? techImages.length - 1 : i - 1))
                }
                className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-white/15 px-4 text-white active:bg-white/25"
              >
                ←
              </button>
              <p className="text-sm tabular-nums text-white/80">
                {specIndex + 1} / {techImages.length}
              </p>
              <button
                type="button"
                onClick={() =>
                  setSpecIndex((i) => (i >= techImages.length - 1 ? 0 : i + 1))
                }
                className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-white/15 px-4 text-white active:bg-white/25"
              >
                →
              </button>
            </div>
          ) : (
            <div className="h-3 safe-bottom" />
          )}
        </div>
      ) : null}
    </>
  );
}
