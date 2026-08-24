"use client";

import { useEffect, useState } from "react";
import { PRODUCT_PLACEHOLDER_SRC, toLocalImageUrl } from "@/lib/image-url";
import { findTechSpecImages } from "@/lib/tech-specs";
import { DefectExamplesPopup } from "./DefectExamplesPopup";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  /** Имя товара — для кнопки «Технические характеристики» */
  productName?: string;
  /** Открывать крупный просмотр по нажатию (по умолчанию true) */
  previewable?: boolean;
  /** Сразу грузить (отправки / видимая карточка) — без lazy-задержки */
  priority?: boolean;
  /**
   * Поиск по товару (сборка): тап по миниатюре фильтрует список.
   * Крупное фото — маленькая кнопка «лупа» на миниатюре.
   */
  onFind?: () => void;
  findLabel?: string;
}

export function ProductImage({
  src,
  alt,
  className,
  sizes: _sizes,
  productName,
  previewable = true,
  priority = false,
  onFind,
  findLabel = "Найти этот товар",
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [defectsOpen, setDefectsOpen] = useState(false);
  const [specIndex, setSpecIndex] = useState(0);
  const imageSrc = toLocalImageUrl(src);
  const techImages = previewable || onFind ? findTechSpecImages(productName || alt) : null;
  const hasSpecs = Boolean(techImages?.length);
  const loading = priority ? "eager" : "lazy";
  const decoding = priority ? "sync" : "async";
  const fetchPriority = priority ? "high" : undefined;
  const canPreview = previewable;
  const findMode = Boolean(onFind);
  const label = productName || alt;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!open && !specsOpen && !defectsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (defectsOpen) setDefectsOpen(false);
      else if (specsOpen) setSpecsOpen(false);
      else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, specsOpen, defectsOpen]);

  useEffect(() => {
    if (!specsOpen) setSpecIndex(0);
  }, [specsOpen]);

  if (!imageSrc || failed) {
    return (
      <div className="absolute inset-0 h-full w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PRODUCT_PLACEHOLDER_SRC}
          alt=""
          draggable={false}
          loading={loading}
          decoding={decoding}
          className={`h-full w-full object-cover ${className ?? ""}`}
        />
      </div>
    );
  }

  return (
    <>
      <div
        role={canPreview || findMode ? "button" : undefined}
        tabIndex={canPreview || findMode ? 0 : undefined}
        onClick={(event) => {
          if (!canPreview && !findMode) return;
          event.preventDefault();
          event.stopPropagation();
          if (findMode && onFind) {
            onFind();
            return;
          }
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!canPreview && !findMode) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            if (findMode && onFind) {
              onFind();
              return;
            }
            setOpen(true);
          }
        }}
        aria-label={findMode ? `Найти: ${label}` : canPreview ? `Открыть фото: ${label}` : undefined}
        className={`absolute inset-0 block h-full w-full overflow-hidden p-0 ${
          canPreview || findMode ? "active:opacity-90" : ""
        } ${findMode ? "cursor-pointer" : canPreview ? "cursor-zoom-in" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={alt}
          draggable={false}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          className={`absolute inset-0 h-full w-full select-none [-webkit-user-drag:none] ${className ?? ""}`}
          onError={() => setFailed(true)}
          onDragStart={(event) => event.preventDefault()}
        />
      </div>

      {findMode && canPreview ? (
        <button
          type="button"
          aria-label={`Фото: ${label}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          className="absolute bottom-1 left-1 z-[2] flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white shadow-sm active:bg-black/70"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3-3" />
          </svg>
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="mx-auto flex w-full max-w-sm flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative overflow-hidden rounded-2xl bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt={alt}
                className="block h-auto max-h-[min(62dvh,26rem)] w-full bg-white object-contain"
                draggable={false}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-2xl leading-none text-white active:bg-gray-800"
              >
                ×
              </button>
            </div>
            <div className="mt-3 flex w-full flex-col gap-2">
              {onFind ? (
                <button
                  type="button"
                  onClick={() => {
                    onFind();
                    setOpen(false);
                  }}
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-gray-900 active:bg-gray-100"
                >
                  {findLabel}
                </button>
              ) : null}
              <button
                type="button"
                disabled={!hasSpecs}
                onClick={() => {
                  if (!hasSpecs) return;
                  setSpecsOpen(true);
                }}
                className={`flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold ${
                  hasSpecs
                    ? "bg-white text-gray-900 active:bg-gray-100"
                    : "cursor-not-allowed bg-white text-gray-400"
                }`}
              >
                Технические характеристики
              </button>
              <button
                type="button"
                onClick={() => setDefectsOpen(true)}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-gray-900 active:bg-gray-100"
              >
                Виды брака
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {specsOpen && techImages && techImages.length > 0 ? (
        <div
          className="fixed inset-0 z-[95] bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="Технические характеристики"
          onClick={() => setSpecsOpen(false)}
        >
          <button
            type="button"
            onClick={() => setSpecsOpen(false)}
            aria-label="Закрыть"
            className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-3xl leading-none text-white safe-top active:bg-white/20"
          >
            ×
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={techImages[specIndex]}
            alt="Технические характеристики"
            className="h-full w-full object-contain"
            draggable={false}
            onClick={(event) => event.stopPropagation()}
          />

          {techImages.length > 1 ? (
            <div
              className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 px-3 py-3 safe-bottom"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setSpecIndex((i) => (i <= 0 ? techImages.length - 1 : i - 1))
                }
                className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-black/50 px-4 text-white active:bg-black/70"
              >
                ←
              </button>
              <p className="rounded-full bg-black/50 px-3 py-1 text-sm tabular-nums text-white/90">
                {specIndex + 1} / {techImages.length}
              </p>
              <button
                type="button"
                onClick={() =>
                  setSpecIndex((i) => (i >= techImages.length - 1 ? 0 : i + 1))
                }
                className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-black/50 px-4 text-white active:bg-black/70"
              >
                →
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <DefectExamplesPopup open={defectsOpen} onClose={() => setDefectsOpen(false)} />
    </>
  );
}
