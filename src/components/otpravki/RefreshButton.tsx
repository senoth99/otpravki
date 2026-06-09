"use client";

interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function RefreshButton({ onClick, loading, disabled }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title="Обновить заказы и товары с API"
      className="group inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-colors group-hover:bg-gray-200 group-disabled:bg-gray-100 ${
          loading ? "animate-pulse" : ""
        }`}
      >
        <svg
          className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </span>
      <span className="hidden sm:inline">{loading ? "Обновляем…" : "Обновить"}</span>
    </button>
  );
}
