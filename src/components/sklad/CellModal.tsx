"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiStockItem, WarehouseCell } from "@/types/stock";
import { PRODUCT_PLACEHOLDER_SRC, toLocalImageUrl } from "@/lib/image-url";

interface CellModalProps {
  furnitureId: string;
  cellKey: string; // "r2c3"
  cell: WarehouseCell;
  furnitureLabel: string;
  stock: ApiStockItem[];
  onSave: (furnitureId: string, cellKey: string, cell: WarehouseCell) => void;
  onClear: (furnitureId: string, cellKey: string) => void;
  onClose: () => void;
}

function formatCellKey(cellKey: string): string {
  return cellKey.replace(/r(\d+)c(\d+)/, "Р$1 Я$2");
}

function ProductThumb({ item, size = 36 }: { item?: ApiStockItem; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = item?.imageUrl ? toLocalImageUrl(item.imageUrl) : "";

  if (!src || failed) {
    return (
      <img
        src={PRODUCT_PLACEHOLDER_SRC}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-lg object-cover"
      />
    );
  }

  return (
    <img
      src={src}
      alt={item?.productName ?? ""}
      width={size}
      height={size}
      className="shrink-0 rounded-lg object-cover bg-gray-100"
      onError={() => setFailed(true)}
    />
  );
}

function ProductPicker({
  stock,
  value,
  onChange,
}: {
  stock: ApiStockItem[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = stock.find((s) => s.productSlug === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stock;
    return stock.filter(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.productSlug.toLowerCase().includes(q),
    );
  }, [stock, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(slug: string) {
    onChange(slug);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-white focus:border-gray-400 focus:bg-white"
      >
        <ProductThumb item={selected} size={32} />
        <span className="min-w-0 flex-1 truncate text-gray-900">
          {selected ? (
            <>
              {selected.productName}
              {selected.brand ? (
                <span className="text-gray-500"> · {selected.brand}</span>
              ) : null}
            </>
          ) : (
            <span className="text-gray-400">— Пусто —</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию или бренду..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => pick("")}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                  !value ? "bg-blue-50 text-blue-900" : "text-gray-700"
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
                  ∅
                </div>
                <span>— Пусто —</span>
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-gray-400">Ничего не найдено</li>
            ) : (
              filtered.map((item) => (
                <li key={item.productSlug}>
                  <button
                    type="button"
                    onClick={() => pick(item.productSlug)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                      value === item.productSlug ? "bg-blue-50 text-blue-900" : "text-gray-900"
                    }`}
                  >
                    <ProductThumb item={item} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 leading-snug">{item.productName}</span>
                      {item.brand ? (
                        <span className="block truncate text-xs text-gray-500">{item.brand}</span>
                      ) : null}
                    </span>
                    {item.totalQuantity > 0 && (
                      <span className="shrink-0 text-xs text-gray-400">{item.totalQuantity} шт</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CellModal({
  furnitureId,
  cellKey,
  cell,
  stock,
  onSave,
  onClear,
  onClose,
}: CellModalProps) {
  const sortedStock = useMemo(
    () => [...stock].sort((a, b) => a.productName.localeCompare(b.productName, "ru")),
    [stock],
  );

  const [selectedSlug, setSelectedSlug] = useState<string>(cell.productSlug ?? "");
  const [selectedSizes, setSelectedSizes] = useState<string[]>(cell.sizes ?? []);
  const [label, setLabel] = useState(cell.label ?? "");

  const selectedProduct = sortedStock.find((s) => s.productSlug === selectedSlug);

  function handleProductChange(slug: string) {
    setSelectedSlug(slug);
    setSelectedSizes([]);
  }

  function toggleSize(size: string) {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size],
    );
  }

  function handleSave() {
    const stockProduct = selectedSlug
      ? sortedStock.find((s) => s.productSlug === selectedSlug)
      : undefined;
    const updated: WarehouseCell = {
      productSlug: selectedSlug || undefined,
      productName: stockProduct?.productName,
      brand: stockProduct?.brand,
      sizes: selectedSizes.length > 0 ? selectedSizes : undefined,
      label: label.trim() || undefined,
    };
    onSave(furnitureId, cellKey, updated);
  }

  function handleClear() {
    onClear(furnitureId, cellKey);
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-mono text-base font-semibold text-gray-900">
            {formatCellKey(cellKey)}
          </h2>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Товар</label>
            <ProductPicker
              stock={sortedStock}
              value={selectedSlug}
              onChange={handleProductChange}
            />
          </div>

          {selectedProduct && selectedProduct.sizes.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Размеры</label>
              <div className="flex flex-wrap gap-2">
                {selectedProduct.sizes.map((sizeEntry, sizeIdx) => {
                  const checked = selectedSizes.includes(sizeEntry.size);
                  return (
                    <label
                      key={`${sizeEntry.size}-${sizeIdx}`}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        checked
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSize(sizeEntry.size)}
                        className="sr-only"
                      />
                      {sizeEntry.size}
                      {sizeEntry.quantity === 0 && <span className="opacity-40"> ×0</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

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
            className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
          >
            Очистить
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
