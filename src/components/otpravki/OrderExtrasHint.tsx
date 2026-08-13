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
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
        Класть в заказ
      </p>
      {brandWide.length > 0 && (
        <p className="mt-1 text-sm font-medium text-gray-900">
          {brandWide.map((extra) => extra.name).join(" · ")}
        </p>
      )}
      {forProducts.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {forProducts.map((extra) => {
            const names = extra.productIds
              .filter((id) => productIds.includes(id))
              .map((id) => nameById.get(id) ?? id);
            return (
              <li key={extra.id} className="text-sm text-gray-800">
                <span className="font-medium">{extra.name}</span>
                {names.length > 0 && (
                  <span className="text-gray-500"> — {names.join(", ")}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
