"use client";

/** Лёгкий оверлей при смене фильтров/бренда — без полоски прогресса. */
export function FilterBusyOverlay({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-[1px] ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Загрузка"
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-gray-200 border-t-gray-900" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://amarix.ru/favicon.ico"
          alt=""
          width={28}
          height={28}
          className="relative h-7 w-7 object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
