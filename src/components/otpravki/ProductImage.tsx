"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { toLocalImageUrl } from "@/lib/image-url";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  /** Открывать крупный просмотр по нажатию (по умолчанию true) */
  previewable?: boolean;
}

export function ProductImage({
  src,
  alt,
  className,
  sizes,
  previewable = true,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const imageSrc = toLocalImageUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
        aria-label={canPreview ? `Открыть фото: ${alt}` : undefined}
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
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <div
            className="relative max-h-[90dvh] w-full max-w-lg overflow-hidden rounded-2xl bg-black shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
              className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-3xl leading-none text-white active:bg-black/75"
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={alt}
              className="max-h-[90dvh] w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
