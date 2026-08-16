"use client";

interface LogoutShiftSummaryProps {
  shipments: number;
  onClose: () => void;
}

export function LogoutShiftSummary({ shipments, onClose }: LogoutShiftSummaryProps) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <p className="text-sm font-medium text-gray-500">Смена завершена</p>
        <p className="mt-3 text-4xl font-bold tabular-nums text-gray-900">{shipments}</p>
        <p className="mt-1 text-sm text-gray-600">отправлено заказов за смену</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gray-900 text-sm font-medium text-white"
        >
          ОК
        </button>
      </div>
    </div>
  );
}
