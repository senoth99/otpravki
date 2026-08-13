"use client";

import { extrasForProductIds, type AssemblyExtra } from "@/lib/assembly-extras";
import type { ShippingOrder } from "@/types/shipping";

export function OrderExtrasHint({
  extras,
  order,
}: {
  extras: AssemblyExtra[];
  order: ShippingOrder;
}) {
  const productIds = order.items.map((item) => item.productId);
  const relevant = extrasForProductIds(extras, productIds);
  if (relevant.length === 0) return null;

  const nameById = new Map(order.items.map((item) => [item.productId, item.productName]));
  const brandWide = relevant.filter((extra) => extra.applyTo === "all");
  const forProducts = relevant.filter((extra) => extra.applyTo === "products");

  return (
    <aside className="w-full shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-3 md:w-64">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
        Класть в заказ
      </p>
      <ul className="mt-2 space-y-2">
        {brandWide.map((extra) => (
          <li key={extra.id} className="text-sm font-medium leading-snug text-gray-900">
            {extra.name}
          </li>
        ))}
        {forProducts.map((extra) => {
          const names = extra.productIds
            .filter((id) => productIds.includes(id))
            .map((id) => nameById.get(id) ?? id);
          return (
            <li key={extra.id} className="text-sm leading-snug text-gray-900">
              <span className="font-medium">{extra.name}</span>
              {names.length > 0 && (
                <span className="mt-0.5 block text-xs text-gray-500">{names.join(", ")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
