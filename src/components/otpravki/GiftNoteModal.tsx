"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { mutatingApiHeaders } from "@/lib/api-headers";
import {
  GIFT_NOTE_CATEGORIES,
  GIFT_NOTE_IMAGES,
  GIFT_NOTE_PRESETS,
  resolveGiftNoteLayout,
  type GiftNoteCategory,
} from "@/lib/gift-note-presets";
import { KeyboardField } from "./VirtualKeyboard";

type GiftNoteModalProps = {
  open: boolean;
  onClose: () => void;
};

export function GiftNoteModal({ open, onClose }: GiftNoteModalProps) {
  const [category, setCategory] = useState<GiftNoteCategory>("birthday");
  const [text, setText] = useState(GIFT_NOTE_PRESETS[0]?.text ?? "");
  const [imageId, setImageId] = useState<string | null>(GIFT_NOTE_PRESETS[0]?.imageId ?? "cake");
  const [copies, setCopies] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const layout = useMemo(() => resolveGiftNoteLayout(text, imageId), [text, imageId]);

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
            body: JSON.stringify({ text, imageId, layout, preview: true }),
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
    if (preset.imageId) setImageId(preset.imageId);
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
        text: `×${data.copies ?? copies} → ${data.printer ?? "принтер"}`,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Записка на баркодник"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(100dvh-1rem,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2.5 sm:px-4">
          <h2 className="min-w-0 flex-1 text-sm font-black tracking-tight text-gray-900">
            Записка · 150×100
          </h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-700"
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-2 sm:px-4">
          <div className="relative h-[88px] shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 sm:h-[100px]">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Превью"
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-400">
                {previewBusy ? "…" : "Превью"}
              </div>
            )}
            {previewError ? (
              <p className="absolute inset-x-0 bottom-0 bg-white/90 px-2 py-0.5 text-[10px] text-red-600">
                {previewError}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-1">
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
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
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
            <div className="flex shrink-0 flex-wrap gap-1">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-800 active:bg-gray-900 active:text-white"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}

          <KeyboardField
            value={text}
            onChange={setText}
            placeholder="Текст записки…"
            title="Текст записки"
            multiline
            rows={2}
            className="w-full shrink-0 resize-none rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none ring-gray-900 focus:ring-2"
          />

          <div className="flex shrink-0 flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setImageId(null)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[10px] font-medium ${
                imageId === null
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-500"
              }`}
            >
              Нет
            </button>
            {GIFT_NOTE_IMAGES.map((img) => (
              <button
                key={img.id}
                type="button"
                title={img.label}
                onClick={() => setImageId(img.id)}
                className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border bg-white p-1 ${
                  imageId === img.id ? "border-gray-900 ring-2 ring-gray-900" : "border-gray-200"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt={img.label} className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          </div>

          {message ? (
            <p className={`shrink-0 text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>
              {message.text}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-gray-100 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCopies(n)}
                className={`flex h-10 w-8 items-center justify-center rounded-lg border text-sm font-semibold ${
                  copies === n
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-800"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800"
          >
            Закрыть
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void printNote()}
            className="h-10 min-w-0 flex-1 rounded-xl bg-gray-900 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "…" : "Печать"}
          </button>
        </footer>
      </div>
    </div>
  );
}
