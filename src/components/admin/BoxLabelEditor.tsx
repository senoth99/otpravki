"use client";

import { useEffect, useMemo, useState } from "react";
import { BOX_LABEL_BRANDS, type BoxLabelBrandId } from "@/lib/box-label-brands";
import { mutatingApiHeaders } from "@/lib/api-headers";

export function BoxLabelEditor() {
  const [brandId, setBrandId] = useState<BoxLabelBrandId>("casher");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [logoOk, setLogoOk] = useState(true);
  const [logoKey, setLogoKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setLogoOk(true);
    setLogoKey((k) => k + 1);
  }, [brandId]);

  const previewCategory = category.trim().toUpperCase();
  const previewName = useMemo(() => {
    const t = name.trim();
    if (!t) return "";
    if (/^[«"].*[»"]$/.test(t)) return t.toUpperCase();
    return `«${t.toUpperCase()}»`;
  }, [name]);
  const previewColor = useMemo(() => {
    const t = color.trim();
    if (!t) return "";
    if (/^color\s*:/i.test(t)) return t.toUpperCase();
    return `COLOR: ${t.toUpperCase()}`;
  }, [color]);
  const previewSize = useMemo(() => {
    const t = size.trim();
    if (!t) return "";
    if (/^size\s*:/i.test(t)) return t.toUpperCase();
    return `SIZE: ${t.toUpperCase()}`;
  }, [size]);

  const brandLabel = BOX_LABEL_BRANDS.find((b) => b.id === brandId)?.label ?? "";

  const printLabel = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/box-label", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { ...mutatingApiHeaders(), Accept: "application/json" },
        body: JSON.stringify({ brandId, category, name, color, size }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; printer?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "Не удалось напечатать");
      }
      setMessage({
        ok: true,
        text: `Отправлено на ${data.printer ?? "принтер"}`,
      });
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Ошибка печати",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-lg gap-4 py-2">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-gray-700">Бренд / логотип</span>
        <select
          value={brandId}
          disabled={busy}
          onChange={(e) => setBrandId(e.target.value as BoxLabelBrandId)}
          className="min-h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base font-semibold text-gray-900 shadow-sm disabled:opacity-50"
        >
          {BOX_LABEL_BRANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} — {b.site.replace(/^https?:\/\//, "")}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-gray-700">Категория</span>
        <input
          value={category}
          disabled={busy}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Джерси-поло"
          className="min-h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base text-gray-900 shadow-sm disabled:opacity-50"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-gray-700">Название (жирный)</span>
        <input
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          placeholder="AMMO"
          className="min-h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base font-bold text-gray-900 shadow-sm disabled:opacity-50"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-gray-700">Цвет</span>
        <input
          value={color}
          disabled={busy}
          onChange={(e) => setColor(e.target.value)}
          placeholder="Purple"
          className="min-h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-900 shadow-sm disabled:opacity-50"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-gray-700">Размер (крупный жирный)</span>
        <input
          value={size}
          disabled={busy}
          onChange={(e) => setSize(e.target.value)}
          placeholder="M"
          className="min-h-14 w-full rounded-2xl border border-gray-200 bg-white px-4 text-2xl font-bold tracking-wide text-gray-900 shadow-sm disabled:opacity-50"
        />
      </label>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="border-b border-gray-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Превью
        </p>
        <div className="flex aspect-[3/2] min-h-0 flex-col items-center justify-between bg-white px-6 py-5 text-center">
          <div className="flex w-full flex-col items-center gap-5">
            <img
              key={logoKey}
              src={`/api/admin/box-label/logo?brand=${brandId}&t=${logoKey}`}
              alt={`Логотип ${brandLabel}`}
              className="h-12 w-auto max-w-[70%] object-contain"
              onLoad={() => setLogoOk(true)}
              onError={() => setLogoOk(false)}
            />
            {!logoOk && (
              <p className="text-xs text-red-600">Не удалось загрузить логотип с сайта</p>
            )}
            {previewCategory ? (
              <p className="text-xl uppercase tracking-wide text-gray-900">{previewCategory}</p>
            ) : null}
            {previewName ? (
              <p className="text-4xl font-bold uppercase tracking-wide text-gray-900">{previewName}</p>
            ) : null}
            {previewColor ? (
              <p className="text-sm font-bold uppercase tracking-wide text-gray-900">{previewColor}</p>
            ) : null}
            {previewSize ? (
              <p className="text-2xl font-bold uppercase tracking-wide text-gray-900">{previewSize}</p>
            ) : null}
          </div>
          <p className="pt-8 text-base font-bold uppercase tracking-[0.2em] text-gray-900">
            {brandLabel}
          </p>
        </div>
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={() => void printLabel()}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-gray-900 px-5 text-base font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? "Печать…" : "Печать надписи 150×100"}
      </button>

      {message && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
