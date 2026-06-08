"use client";

interface ScanErrorPopupProps {
  message: string;
  onClose: () => void;
}

export function ScanErrorPopup({ message, onClose }: ScanErrorPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl safe-bottom sm:p-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="text-center text-lg font-semibold text-gray-900">Ошибка сканирования</h3>
        <p className="mt-2 text-center text-sm text-gray-600">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
