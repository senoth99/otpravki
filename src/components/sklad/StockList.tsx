"use client";

import { useMemo, useState } from "react";
import type { ApiStockItem } from "@/types/stock";
import { StockItemCard } from "./StockItemCard";

interface StockListProps {
  items: ApiStockItem[];
}

export function StockList({ items }: StockListProps) {
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [onlyInStock, setOnlyInStock] = useState(false);

  const brands = useMemo(() => {
    const set = new Set(items.map((i) => i.brand));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.productName.toLowerCase().includes(q) ||
          i.brand.toLowerCase().includes(q)
      );
    }

    if (brandFilter !== "all") {
      result = result.filter((i) => i.brand === brandFilter);
    }

    if (onlyInStock) {
      result = result.filter((i) => i.totalQuantity > 0);
    }

    // Sort: in stock first, then alphabetically within each group
    return [...result].sort((a, b) => {
      const aInStock = a.totalQuantity > 0 ? 0 : 1;
      const bInStock = b.totalQuantity > 0 ? 0 : 1;
      if (aInStock !== bInStock) return aInStock - bInStock;
      return a.productName.localeCompare(b.productName, "ru");
    });
  }, [items, search, brandFilter, onlyInStock]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-3 sm:p-4">
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
        />

        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-gray-400 focus:bg-white sm:w-auto"
        >
          <option value="all">Все бренды</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 sm:whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlyInStock}
            onChange={(e) => setOnlyInStock(e.target.checked)}
            className="h-4 w-4 rounded accent-gray-900"
          />
          Только в наличии
        </label>
      </div>

      {/* Results count */}
      <p className="px-1 text-xs text-gray-400">
        {filtered.length} товар{filtered.length === 1 ? "" : filtered.length < 5 ? "а" : "ов"}
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Ничего не найдено</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <StockItemCard key={item.productSlug} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
