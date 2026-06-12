"use client";

import { useState } from "react";
import type { ApiStockItem, WarehouseCell } from "@/types/stock";

interface CellModalProps {
  cell: WarehouseCell;
  stock: ApiStockItem[];
  onSave: (cell: WarehouseCell) => void;
  onClose: () => void;
}

export function CellModal({ cell, stock, onSave, onClose }: CellModalProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(
    cell.productSlug ?? ""
  );
  const [selectedSizes, setSelectedSizes] = useState<string[]>(
    cell.sizes ?? []
  );
  const [label, setLabel] = useState(cell.label ?? "");

  const selectedProduct = stock.find((s) => s.productSlug === selectedSlug);

  function handleProductChange(slug: string) {
    setSelectedSlug(slug);
    setSelectedSizes([]);
  }

  function toggleSize(size: string) {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }

  function handleSave() {
    const updated: WarehouseCell = {
      ...cell,
      productSlug: selectedSlug || undefined,
      productName: selectedProduct?.productName,
      brand: selectedProduct?.brand,
      sizes: selectedSizes.length > 0 ? selectedSizes : undefined,
      label: label.trim() || undefined,
    };
    onSave(updated);
  }

  function handleClear() {
    const cleared: WarehouseCell = {
      ...cell,
      productSlug: undefined,
      productName: undefined,
      brand: undefined,
      sizes: undefined,
      label: undefined,
    };
    onSave(cleared);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Ячейка <span className="font-mono text-sm text-gray-500">{cell.id}</span>
          </h2>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Product select */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Товар
            </label>
            <select
              value={selectedSlug}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:bg-white"
            >
              <option value="">— Пусто —</option>
              {stock.map((item) => (
                <option key={item.productSlug} value={item.productSlug}>
                  {item.productName} ({item.brand})
                </option>
              ))}
            </select>
          </div>

          {/* Sizes checkboxes */}
          {selectedProduct && selectedProduct.sizes.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Размеры
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedProduct.sizes.map((sizeEntry) => {
                  const checked = selectedSizes.includes(sizeEntry.size);
                  return (
                    <label
                      key={sizeEntry.id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        checked
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-gray-50 text-gray-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSize(sizeEntry.size)}
                        className="sr-only"
                      />
                      {sizeEntry.size}
                      {sizeEntry.quantity === 0 && (
                        <span className="opacity-50"> ×0</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Label */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Метка (необязательно)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="например: верхний ряд"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-opacity active:opacity-80"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors active:bg-red-50"
          >
            Очистить
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors active:bg-gray-50"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
