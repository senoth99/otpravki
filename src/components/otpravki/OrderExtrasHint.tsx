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
      className="inline-flex h-[1.1em] w-[1.1em] shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white text-[0.7em] font-bold leading-none text-amber-800 active:bg-amber-100"
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
            <li key={extra.id} className="flex items-center gap-1 text-sm font-medium leading-snug text-gray-900">
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
                <div className="flex items-center gap-1 font-medium">
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
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:max-w-sm sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative border-b border-gray-100 px-4 py-3 pr-14">
              <p className="font-semibold text-gray-900">{preview.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">Мокап вкладыша</p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Закрыть"
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-gray-500 active:bg-gray-100"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain p-4">
              <figure className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.imageUrl}
                  alt={preview.name}
                  className="mx-auto max-h-48 w-auto max-w-full object-contain bg-gray-100"
                  draggable={false}
                />
              </figure>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
