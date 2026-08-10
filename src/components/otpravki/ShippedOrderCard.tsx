"use client";

import { formatMoscowDate } from "@/lib/format";
import { OrderNumberDisplay } from "./OrderNumberDisplay";

interface ShippedOrderCardProps {
  orderNumber: string;
  customerName: string;
  createdAt?: string;
  onNext?: () => void;
  hasNext: boolean;
}

export function ShippedOrderCard({
  orderNumber,
  customerName,
  createdAt,
  onNext,
  hasNext,
}: ShippedOrderCardProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-green-200 bg-green-50/60 px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <p className="text-sm font-semibold text-gray-900">
        <OrderNumberDisplay orderNumber={orderNumber} className="justify-center" />
      </p>
      <p className="mt-1 text-xs text-gray-500">{customerName}</p>
      {createdAt && (
        <p className="mt-1 text-xs text-gray-500">Заказ от {formatMoscowDate(createdAt)}</p>
      )}
      <p className="mt-3 text-sm font-medium text-green-700">Отправлен</p>
      <p className="mt-1 max-w-xs text-xs text-gray-500">Баркод распечатан, заказ передан в отправку</p>

      {hasNext && onNext && (
        <button
          type="button"
          onClick={onNext}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 text-sm font-medium text-white active:bg-gray-800"
        >
          Следующий заказ
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
