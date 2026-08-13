"use client";

import { useMemo, useState } from "react";
import {
  extraAppliesToProduct,
  extrasForProductIds,
  type AssemblyExtra,
} from "@/lib/assembly-extras";
import type { AssemblyItem } from "@/types/shipping";

interface AssemblyExtrasPanelProps {
  extras: AssemblyExtra[];
  items: AssemblyItem[];
  currentProductId?: string | null;
  autoMode?: boolean;
  brand?: string;
}

export function AssemblyExtrasPanel({
  extras,
  items,
  currentProductId,
  autoMode,
  brand,
}: AssemblyExtrasPanelProps) {
  const [done, setDone] = useState<Set<string>>(() => new Set());

  const productIds = useMemo(
    () => new Set(items.map((item) => item.productId)),
    [items],
  );
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (!map.has(item.productId)) map.set(item.productId, item.productName);
    }
    return map;
  }, [items]);

  const relevant = useMemo(
    () => extrasForProductIds(extras, productIds),
    [extras, productIds],
  );
  const currentExtras = useMemo(() => {
    if (!currentProductId) return [];
    return extras.filter((extra) => extraAppliesToProduct(extra, currentProductId));
  }, [extras, currentProductId]);

  const brandWide = relevant.filter((extra) => extra.applyTo === "all");
  const forProducts = relevant.filter((extra) => extra.applyTo === "products");

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentName = currentProductId ? nameById.get(currentProductId) : null;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
      <div className="shrink-0 border-b border-amber-200 px-3 py-3">
        <p className="text-sm font-semibold text-gray-900">Класть в заказ</p>
        <p className="mt-0.5 text-xs text-gray-600">Допы{brand ? ` · ${brand}` : ""}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {relevant.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Для этой сборки допов нет</p>
        ) : (
          <div className="space-y-4">
            {autoMode && currentProductId && currentExtras.length > 0 && (
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  Сейчас{currentName ? ` · ${currentName}` : ""}
                </p>
                <ul className="space-y-1.5">
                  {currentExtras.map((extra) => (
                    <ExtraRow
                      key={`current-${extra.id}`}
                      extra={extra}
                      checked={done.has(extra.id)}
                      onToggle={() => toggle(extra.id)}
                      hint={extra.applyTo === "all" ? "во все" : undefined}
                    />
                  ))}
                </ul>
              </section>
            )}

            {brandWide.length > 0 && (
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Во все заказы
                </p>
                <ul className="space-y-1.5">
                  {brandWide.map((extra) => (
                    <ExtraRow
                      key={extra.id}
                      extra={extra}
                      checked={done.has(extra.id)}
                      onToggle={() => toggle(extra.id)}
                    />
                  ))}
                </ul>
              </section>
            )}

            {forProducts.length > 0 && (
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  К товарам
                </p>
                <ul className="space-y-2">
                  {forProducts.map((extra) => {
                    const names = extra.productIds
                      .filter((id) => productIds.has(id))
                      .map((id) => nameById.get(id) ?? id);
                    return (
                      <li key={extra.id}>
                        <ExtraRow
                          extra={extra}
                          checked={done.has(extra.id)}
                          onToggle={() => toggle(extra.id)}
                        />
                        {names.length > 0 && (
                          <p className="mt-1 pl-8 text-[11px] leading-snug text-gray-400">
                            {names.join(" · ")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function ExtraRow({
  extra,
  checked,
  onToggle,
  hint,
}: {
  extra: AssemblyExtra;
  checked: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-2 text-left active:scale-[0.99]"
    >
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${
          checked ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      <span className={`min-w-0 flex-1 text-sm ${checked ? "text-gray-400 line-through" : "text-gray-900"}`}>
        {extra.name}
        {hint ? <span className="ml-1 text-[11px] text-gray-400">· {hint}</span> : null}
      </span>
    </button>
  );
}
