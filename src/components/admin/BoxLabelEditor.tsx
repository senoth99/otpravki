"use client";

import { useEffect, useState } from "react";
import { BOX_LABEL_BRANDS, type BoxLabelBrandId } from "@/lib/box-label-brands";
import { mutatingApiHeaders } from "@/lib/api-headers";

export function BoxLabelEditor() {
  const [brandId, setBrandId] = useState<BoxLabelBrandId>("casher");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const timer = window.setTimeout(() => {
      void (async () => {
        setPreviewBusy(true);
        setPreviewError(null);
        try {
          const res = await fetch("/api/admin/box-label", {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            headers: { ...mutatingApiHeaders(), Accept: "image/png" },
            body: JSON.stringify({
              brandId,
              category,
              name,
              color,
              size,
              preview: true,
            }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(data.message ?? "Не удалось собрать превью");
          }
          const blob = await res.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return objectUrl;
          });
        } catch (err) {
          if (!cancelled) {
            setPreviewError(err instanceof Error ? err.message : "Ошибка превью");
          }
        } finally {
          if (!cancelled) setPreviewBusy(false);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [brandId, category, name, color, size]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
        <span className="text-sm font-medium text-gray-700">Размер</span>
        <input
          value={size}
          disabled={busy}
          onChange={(e) => setSize(e.target.value)}
          placeholder="M"
          className="min-h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-xl font-bold tracking-wide text-gray-900 shadow-sm disabled:opacity-50"
        />
      </label>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <p className="border-b border-gray-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          Превью печати 100×150
        </p>
        <div className="flex justify-center bg-gray-100 px-4 py-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Превью этикетки"
              className={`h-auto w-full max-w-[240px] border border-gray-200 bg-white shadow-sm ${
                previewBusy ? "opacity-60" : ""
              }`}
            />
          ) : (
            <div className="flex aspect-[2/3] w-full max-w-[240px] items-center justify-center bg-white text-sm text-gray-400">
              {previewBusy ? "Сборка…" : previewError ?? "Заполни поля"}
            </div>
          )}
        </div>
        {previewError && previewUrl && (
          <p className="px-4 pb-3 text-xs text-red-600">{previewError}</p>
        )}
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={() => void printLabel()}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-gray-900 px-5 text-base font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? "Печать…" : "Печать надписи 100×150"}
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
