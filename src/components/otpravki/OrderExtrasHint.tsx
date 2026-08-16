"use client";

import { useState } from "react";
import { extrasForProductIds, type AssemblyExtra } from "@/lib/assembly-extras";
import type { ShippingOrder } from "@/types/shipping";

function ExtraInfoButton({
  extra,
  onOpen,
}: {
  extra: AssemblyExtra;
  onOpen: (extra: AssemblyExtra) => void;
}) {
  if (!extra.imageUrl?.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(extra)}
      aria-label={`Мокап: ${extra.name}`}
      title="Мокап"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white text-sm font-bold leading-none text-amber-800 active:bg-amber-100"
    >
      i
    </button>
  );
}

export function OrderExtrasHint({
  extras,
  order,
}: {
  extras: AssemblyExtra[];
  order: ShippingOrder;
}) {
  const [preview, setPreview] = useState<AssemblyExtra | null>(null);
  const productIds = order.items.map((item) => item.productId);
  const relevant = extrasForProductIds(extras, productIds);
  if (relevant.length === 0) return null;

  const nameById = new Map(order.items.map((item) => [item.productId, item.productName]));
  const brandWide = relevant.filter((extra) => extra.applyTo === "all");
  const forProducts = relevant.filter((extra) => extra.applyTo === "products");

  return (
    <>
      <aside className="w-full shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-3 md:w-64">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
          Класть в заказ
        </p>
        <ul className="mt-2 space-y-2">
          {brandWide.map((extra) => (
            <li key={extra.id} className="flex items-center gap-1.5 text-sm font-medium leading-snug text-gray-900">
              <span className="min-w-0">{extra.name}</span>
              <ExtraInfoButton extra={extra} onOpen={setPreview} />
            </li>
          ))}
          {forProducts.map((extra) => {
            const names = extra.productIds
              .filter((id) => productIds.includes(id))
              .map((id) => nameById.get(id) ?? id);
            return (
              <li key={extra.id} className="text-sm leading-snug text-gray-900">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="min-w-0">{extra.name}</span>
                  <ExtraInfoButton extra={extra} onOpen={setPreview} />
                </div>
                {names.length > 0 && (
                  <span className="mt-0.5 block text-xs text-gray-500">{names.join(", ")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </aside>

      {preview?.imageUrl ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative flex w-[min(100%,calc(85dvh*9/16))] max-w-md flex-col overflow-hidden rounded-2xl bg-black shadow-2xl"
            style={{ aspectRatio: "9 / 16" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-3">
              <p className="min-w-0 pt-1 text-sm font-semibold leading-snug text-white drop-shadow">
                {preview.name}
              </p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Закрыть"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl leading-none text-white active:bg-white/25"
              >
                ×
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.imageUrl}
              alt={preview.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
