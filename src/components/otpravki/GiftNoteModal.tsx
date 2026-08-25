"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { mutatingApiHeaders } from "@/lib/api-headers";
import {
  GIFT_NOTE_CATEGORIES,
  GIFT_NOTE_IMAGES,
  GIFT_NOTE_PRESETS,
  type GiftNoteCategory,
  type GiftNoteLayout,
} from "@/lib/gift-note-presets";
import { KeyboardField } from "./VirtualKeyboard";

type GiftNoteModalProps = {
  open: boolean;
  onClose: () => void;
};

const LAYOUTS: Array<{ id: GiftNoteLayout; label: string }> = [
  { id: "image-left", label: "Картинка слева" },
  { id: "image-top", label: "Картинка сверху" },
  { id: "text", label: "Только текст" },
  { id: "image-only", label: "Только картинка" },
];

export function GiftNoteModal({ open, onClose }: GiftNoteModalProps) {
  const [category, setCategory] = useState<GiftNoteCategory>("birthday");
  const [text, setText] = useState(GIFT_NOTE_PRESETS[0]?.text ?? "");
  const [imageId, setImageId] = useState<string | null>(GIFT_NOTE_PRESETS[0]?.imageId ?? "cake");
  const [layout, setLayout] = useState<GiftNoteLayout>("image-left");
  const [copies, setCopies] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const presets = useMemo(
    () => GIFT_NOTE_PRESETS.filter((p) => p.category === category),
    [category],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const timer = window.setTimeout(() => {
      void (async () => {
        setPreviewBusy(true);
        setPreviewError(null);
        try {
          const res = await fetch("/api/print/note", {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            headers: { ...mutatingApiHeaders(), Accept: "image/png" },
            body: JSON.stringify({
              text,
              imageId,
              layout,
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
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, text, imageId, layout]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = GIFT_NOTE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setText(preset.text);
    if (preset.imageId) {
      setImageId(preset.imageId);
      setLayout((prev) => (prev === "text" ? "image-left" : prev));
    }
  }, []);

  const printNote = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/print/note", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { ...mutatingApiHeaders(), Accept: "application/json" },
        body: JSON.stringify({ text, imageId, layout, copies }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        printer?: string;
        copies?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "Не удалось напечатать");
      }
      setMessage({
        ok: true,
        text: `Напечатано ×${data.copies ?? copies} → ${data.printer ?? "принтер"}`,
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Записка на баркодник"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(96vh,920px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black tracking-tight text-gray-900 sm:text-lg">
              Записка на этикетку
            </h2>
            <p className="text-xs text-gray-500">150×100 мм, горизонтально — как обычный баркод</p>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-700"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            <div className="relative aspect-[3/2] w-full">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Превью записки"
                  className="absolute inset-0 h-full w-full object-contain p-2"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                  {previewBusy ? "Собираю превью…" : "Превью"}
                </div>
              )}
              {previewBusy && previewUrl ? (
                <div className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  обновляю
                </div>
              ) : null}
            </div>
            {previewError ? (
              <p className="border-t border-gray-100 px-3 py-2 text-xs text-red-600">{previewError}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {GIFT_NOTE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategory(cat.id);
                  if (cat.id === "custom") {
                    setText("");
                  } else {
                    const first = GIFT_NOTE_PRESETS.find((p) => p.category === cat.id);
                    if (first) {
                      setText(first.text);
                      if (first.imageId) setImageId(first.imageId);
                    }
                  }
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  category === cat.id
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-800"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {category !== "custom" ? (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-left text-xs font-medium text-gray-800 active:bg-gray-900 active:text-white"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Текст
            </label>
            <KeyboardField
              value={text}
              onChange={setText}
              placeholder="Напиши записку…"
              title="Текст записки"
              multiline
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 outline-none ring-gray-900 focus:ring-2"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Картинка
            </label>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              <button
                type="button"
                onClick={() => {
                  setImageId(null);
                  setLayout("text");
                }}
                className={`flex aspect-square items-center justify-center rounded-xl border text-xs font-medium ${
                  imageId === null
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                Нет
              </button>
              {GIFT_NOTE_IMAGES.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  title={img.label}
                  onClick={() => {
                    setImageId(img.id);
                    setLayout((prev) => (prev === "text" ? "image-left" : prev));
                  }}
                  className={`flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-white p-1.5 ${
                    imageId === img.id ? "border-gray-900 ring-2 ring-gray-900" : "border-gray-200"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt={img.label} className="max-h-full max-w-full object-contain" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Раскладка
            </label>
            <div className="flex flex-wrap gap-1.5">
              {LAYOUTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLayout(item.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                    layout === item.id
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-800"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Копий</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCopies(n)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold ${
                    copies === n
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-800"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {message ? (
            <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>
              {message.text}
            </p>
          ) : null}
        </div>

        <footer className="flex gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800"
          >
            Закрыть
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void printNote()}
            className="h-12 flex-[1.4] rounded-xl bg-gray-900 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Печатаю…" : "Напечатать"}
          </button>
        </footer>
      </div>
    </div>
  );
}
