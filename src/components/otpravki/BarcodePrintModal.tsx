"use client";

import { printOrderBarcode } from "@/lib/print-barcode";

interface BarcodePrintModalProps {
  orderNumber: string;
  barcodeData: string;
  onClose: () => void;
  onPrinted: () => void;
}

export function BarcodePrintModal({
  orderNumber,
  barcodeData,
  onClose,
  onPrinted,
}: BarcodePrintModalProps) {
  const handlePrint = async () => {
    await printOrderBarcode(orderNumber, barcodeData);
    onPrinted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Печать баркода</h3>
        <p className="mt-2 text-sm text-gray-600">Заказ {orderNumber}</p>

        <div className="my-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="font-mono text-2xl tracking-widest text-gray-800">
            ||||| {barcodeData} |||||
          </p>
          <p className="mt-2 text-xs text-gray-500">CASHER COLLECTION</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-800"
          >
            Печать
          </button>
        </div>
      </div>
    </div>
  );
}
