"use client";

import type { ApiStockItem } from "@/types/stock";
import { PRODUCT_PLACEHOLDER_SRC } from "@/lib/image-url";

interface StockItemCardProps {
  item: ApiStockItem;
}

export function StockItemCard({ item }: StockItemCardProps) {
  const outOfStock = item.totalQuantity === 0;

  return (
    <div
      className={`flex w-full gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:gap-4 sm:p-4 ${
        outOfStock ? "opacity-60" : ""
      }`}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-20 sm:w-20">
        <img
          src={item.imageUrl || PRODUCT_PLACEHOLDER_SRC}
          alt={item.productName}
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.src = PRODUCT_PLACEHOLDER_SRC;
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 sm:truncate">
          {item.productName}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{item.brand}</p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.sizes.map((sizeEntry) => (
            <span
              key={sizeEntry.id}
              className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
                sizeEntry.quantity === 0
                  ? "bg-gray-100 text-gray-400 line-through"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              {sizeEntry.size}: {sizeEntry.quantity} шт
            </span>
          ))}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span
          className={`text-sm font-semibold ${
            outOfStock ? "text-gray-400" : "text-gray-900"
          }`}
        >
          {item.totalQuantity}
        </span>
        <p className="text-xs text-gray-400">шт</p>
      </div>
    </div>
  );
}
