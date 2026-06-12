"use client";

interface AutoModeButtonProps {
  active: boolean;
  onClick: () => void;
  title?: string;
  subtitleActive?: string;
  subtitleInactive?: string;
}

export function AutoModeButton({
  active,
  onClick,
  title = "AUTO MODE",
  subtitleActive = "Сканируй → печать → следующий",
  subtitleInactive = "Автопечать и переход между заказами",
}: AutoModeButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors active:bg-gray-50 sm:px-4 sm:py-3 ${
        active ? "bg-gray-50" : "bg-transparent"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="truncate text-xs text-gray-500">
            {active ? subtitleActive : subtitleInactive}
          </p>
        </div>
      </div>

      <div
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          active ? "bg-gray-900" : "bg-gray-200"
        }`}
      >
        <div
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
            active ? "left-[22px]" : "left-0.5"
          }`}
        />
      </div>
    </button>
  );
}
