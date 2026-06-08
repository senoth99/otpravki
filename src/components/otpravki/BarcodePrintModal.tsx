"use client";

import { useState } from "react";
import { printOrderBarcode } from "@/lib/print-barcode";

interface BarcodePrintModalProps {
  orderNumber: string;
  barcodeUrl?: string;
  onClose: () => void;
  onPrinted: () => void;
}

export function BarcodePrintModal({
  orderNumber,
  barcodeUrl,
  onClose,
  onPrinted,
}: BarcodePrintModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    setError(null);
    const result = await printOrderBarcode(orderNumber, { barcodeUrl });
    setPrinting(false);
    if (!result.ok) {
      setError(result.message ?? "Не удалось напечатать");
      return;
    }
    onPrinted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Печать баркода</h3>
        <p className="mt-2 text-sm text-gray-600">Заказ {orderNumber}</p>

        <div className="my-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="font-mono text-lg text-gray-800">{orderNumber}</p>
          <p className="mt-2 text-xs text-gray-500">
            {barcodeUrl ? "Этикетка СДЭК (PDF)" : "CASHER COLLECTION"}
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {printing ? "Печать…" : "Печать"}
          </button>
        </div>
      </div>
    </div>
  );
}
