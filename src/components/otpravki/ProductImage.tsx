"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { toLocalImageUrl } from "@/lib/image-url";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
}

export function ProductImage({ src, alt, className, sizes }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const imageSrc = toLocalImageUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

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

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      unoptimized
      className={className}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}
