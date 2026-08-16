"use client";

import { useState } from "react";
import { extrasForProductIds, type AssemblyExtra } from "@/lib/assembly-extras";
import type { ShippingOrder } from "@/types/shipping";

export function OrderExtrasHint({
  extras,
  order,
}: {
  extras: AssemblyExtra[];
  order: ShippingOrder;
}) {
  const [open, setOpen] = useState(false);
  const productIds = order.items.map((item) => item.productId);
  const relevant = extrasForProductIds(extras, productIds);
  if (relevant.length === 0) return null;

  const nameById = new Map(order.items.map((item) => [item.productId, item.productName]));
  const brandWide = relevant.filter((extra) => extra.applyTo === "all");
  const forProducts = relevant.filter((extra) => extra.applyTo === "products");
  const withImages = relevant.filter((extra) => Boolean(extra.imageUrl?.trim()));

  return (
    <>
      <aside className="w-full shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-3 md:w-64">
        <div className="inline-flex max-w-full items-center gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Класть в заказ
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Показать мокапы вкладышей"
            title="Мокапы"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white text-[10px] font-bold leading-none text-amber-800 active:bg-amber-100"
          >
            i
          </button>
        </div>
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

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:max-w-lg sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative border-b border-gray-100 px-4 py-3 pr-14">
              <p className="font-semibold text-gray-900">Класть в заказ</p>
              <p className="mt-0.5 text-xs text-gray-500">Мокапы вкладышей для этого заказа</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-gray-500 active:bg-gray-100"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 touch-scroll-y space-y-4 overflow-y-auto overscroll-contain p-4">
              {withImages.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Для этих позиций мокапы пока не загружены
                </p>
              ) : (
                withImages.map((extra) => (
                  <figure key={extra.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={extra.imageUrl}
                      alt={extra.name}
                      className="max-h-72 w-full object-contain bg-gray-100"
                      draggable={false}
                    />
                    <figcaption className="border-t border-gray-100 bg-white px-3 py-2.5 text-sm font-medium text-gray-900">
                      {extra.name}
                    </figcaption>
                  </figure>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
