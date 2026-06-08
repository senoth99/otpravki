"use client";

interface ScanErrorPopupProps {
  message: string;
  title?: string;
  onClose: () => void;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ScanErrorPopup({
  message,
  title = "Ошибка сканирования",
  onClose,
  onRetry,
  retryLabel = "Повторить",
}: ScanErrorPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl safe-bottom sm:p-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="text-center text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-center text-sm text-gray-600">{message}</p>
        <div className={`mt-6 grid gap-2 ${onRetry ? "grid-cols-2" : "grid-cols-1"}`}>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {retryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
