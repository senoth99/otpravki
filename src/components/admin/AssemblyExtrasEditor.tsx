"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EXTRA_BRANDS, type AssemblyExtra } from "@/lib/assembly-extras";
import type { ApiProduct, ShippingOrder } from "@/types/shipping";

interface ProductOption {
  id: string;
  name: string;
}

function newLocalId(): string {
  return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AssemblyExtrasEditor() {
  const [brand, setBrand] = useState<string>(EXTRA_BRANDS[0]);
  const [extras, setExtras] = useState<AssemblyExtra[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [extrasRes, productsRes, workspaceRes] = await Promise.all([
        fetch("/api/admin/extras", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/workspace", { cache: "no-store" }),
      ]);
      const extrasData = (await extrasRes.json()) as { ok?: boolean; extras?: AssemblyExtra[]; error?: string };
      if (!extrasRes.ok || !extrasData.ok) {
        throw new Error(extrasData.error ?? "Не удалось загрузить допы");
      }
      setExtras(extrasData.extras ?? []);

      const catalog = (await productsRes.json()) as { products?: ApiProduct[] };
      const workspace = (await workspaceRes.json()) as {
        workspace?: { orders?: ShippingOrder[] };
      };
      const map = new Map<string, string>();
      const allCatalog = catalog.products ?? [];
      const brandedCatalog = allCatalog.filter(
        (product) => product.brand.trim().toUpperCase() === brand.toUpperCase(),
      );
      for (const product of brandedCatalog.length > 0 ? brandedCatalog : allCatalog) {
        if (product.isDeleted) continue;
        map.set(product.slug, product.name);
      }
      for (const order of workspace.workspace?.orders ?? []) {
        if ((order.storeBrand ?? "CASHER") !== brand) continue;
        for (const item of order.items) {
          if (!map.has(item.productId)) map.set(item.productId, item.productName);
        }
      }
      setProducts(
        [...map.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name, "ru")),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [brand]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: AssemblyExtra[]) => {
    setExtras(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/extras", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: next }),
      });
      const data = (await res.json()) as { ok?: boolean; extras?: AssemblyExtra[]; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Не удалось сохранить");
      }
      setExtras(data.extras ?? next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const brandExtras = extras.filter((extra) => extra.brand === brand);

  const addExtra = () => {
    const name = draftName.trim();
    if (!name) return;
    setDraftName("");
    void save([
      ...extras,
      { id: newLocalId(), brand, name, applyTo: "all", productIds: [] },
    ]);
  };

  const updateExtra = (id: string, patch: Partial<AssemblyExtra>) => {
    void save(extras.map((extra) => (extra.id === id ? { ...extra, ...patch } : extra)));
  };

  const removeExtra = (id: string) => {
    void save(extras.filter((extra) => extra.id !== id));
  };

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (product) => product.name.toLowerCase().includes(q) || product.id.toLowerCase().includes(q),
    );
  }, [products, query]);

  const pickerExtra = extras.find((extra) => extra.id === pickerFor) ?? null;

  const nameById = useMemo(() => {
    const map = new Map(products.map((product) => [product.id, product.name]));
    return map;
  }, [products]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-gray-500">Загрузка допов…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Бренд</span>
        <select
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900"
        >
          {EXTRA_BRANDS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        {saving && <span className="text-xs text-gray-400">Сохранение…</span>}
      </div>

      <div className="flex gap-2">
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addExtra();
          }}
          placeholder="Название допа"
          className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm"
        />
        <button
          type="button"
          onClick={addExtra}
          disabled={!draftName.trim()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-xl font-semibold text-white disabled:opacity-40"
          aria-label="Добавить доп"
        >
          +
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {brandExtras.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          Пока нет допов для {brand}. Добавьте через плюсик.
        </p>
      ) : (
        <ul className="space-y-3">
          {brandExtras.map((extra) => (
            <li key={extra.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-semibold text-gray-900">{extra.name}</p>
                <button
                  type="button"
                  onClick={() => removeExtra(extra.id)}
                  className="inline-flex h-8 items-center rounded-lg px-2 text-sm text-red-600"
                >
                  Удалить
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateExtra(extra.id, { applyTo: "all", productIds: [] })}
                  className={`h-10 rounded-xl border text-sm font-medium ${
                    extra.applyTo === "all"
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-800"
                  }`}
                >
                  Класть во все
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateExtra(extra.id, { applyTo: "products" });
                    setPickerFor(extra.id);
                    setQuery("");
                  }}
                  className={`h-10 rounded-xl border text-sm font-medium ${
                    extra.applyTo === "products"
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-800"
                  }`}
                >
                  К товарам
                </button>
              </div>

              {extra.applyTo === "products" && (
                <div className="mt-3">
                  {extra.productIds.length === 0 ? (
                    <p className="text-xs text-gray-500">Товары не выбраны</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {extra.productIds.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-800"
                        >
                          {nameById.get(id) ?? id}
                          <button
                            type="button"
                            onClick={() =>
                              updateExtra(extra.id, {
                                productIds: extra.productIds.filter((item) => item !== id),
                              })
                            }
                            className="text-gray-400"
                            aria-label="Убрать товар"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPickerFor(extra.id);
                      setQuery("");
                    }}
                    className="mt-2 inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800"
                  >
                    Выбрать товары
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pickerExtra && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full overflow-hidden rounded-t-2xl bg-white sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="font-semibold text-gray-900">Товары · {pickerExtra.name}</p>
              <button
                type="button"
                onClick={() => setPickerFor(null)}
                className="inline-flex h-9 items-center rounded-xl border border-gray-200 px-3 text-sm"
              >
                Готово
              </button>
            </div>
            <div className="p-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск"
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
              />
            </div>
            <div className="max-h-[60dvh] overflow-y-auto px-3 pb-4">
              {filteredProducts.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">Ничего не найдено</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {filteredProducts.map((product) => {
                    const selected = pickerExtra.productIds.includes(product.id);
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const productIds = selected
                              ? pickerExtra.productIds.filter((id) => id !== product.id)
                              : [...pickerExtra.productIds, product.id];
                            updateExtra(pickerExtra.id, { applyTo: "products", productIds });
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-gray-900">
                              {product.name}
                            </span>
                            <span className="block truncate text-[11px] text-gray-400">
                              {product.id}
                            </span>
                          </span>
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${
                              selected
                                ? "border-gray-900 bg-gray-900 text-xs text-white"
                                : "border-gray-200 bg-white"
                            }`}
                          >
                            {selected ? "✓" : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
