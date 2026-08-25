"use client";

import { useEffect, useMemo, useState } from "react";
import { mutatingApiHeaders } from "@/lib/api-headers";
import {
  GIFT_NOTE_IMAGES,
  loadSavedGiftNoteTexts,
  removeSavedGiftNoteText,
  resolveGiftNoteLayout,
  saveGiftNoteText,
  type SavedGiftNoteText,
} from "@/lib/gift-note-presets";
import { KeyboardField } from "./VirtualKeyboard";

type GiftNoteModalProps = {
  open: boolean;
  onClose: () => void;
};

function previewLabel(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 28) return oneLine;
  return `${oneLine.slice(0, 27)}…`;
}

export function GiftNoteModal({ open, onClose }: GiftNoteModalProps) {
  const [text, setText] = useState("");
  const [imageId, setImageId] = useState<string | null>("money");
  const [savedTexts, setSavedTexts] = useState<SavedGiftNoteText[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const layout = useMemo(() => resolveGiftNoteLayout(text, imageId), [text, imageId]);
  const canSave = Boolean(text.trim());

  useEffect(() => {
    if (!open) return;
    setSavedTexts(loadSavedGiftNoteTexts());
  }, [open]);

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
        body: JSON.stringify({ text, imageId, layout, copies: 1 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        printer?: string;
      };
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
        className="flex h-[min(96dvh,880px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-3 sm:px-5">
          <h2 className="min-w-0 flex-1 text-base font-black tracking-tight text-gray-900">
            Записка · 60×55
          </h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-700"
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-3 pb-2 sm:px-5">
          <div className="relative mx-auto min-h-[160px] w-full max-w-[280px] flex-[1.1] overflow-hidden rounded-xl border border-gray-200 bg-gray-50 sm:min-h-[200px] sm:max-w-[320px]">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Превью"
                className="h-full w-full object-contain p-2 sm:p-3"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                {previewBusy ? "Собираю превью…" : "Превью"}
              </div>
            )}
            {previewBusy && previewUrl ? (
              <div className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                обновляю
              </div>
            ) : null}
            {previewError ? (
              <p className="absolute inset-x-0 bottom-0 bg-white/95 px-3 py-1.5 text-xs text-red-600">
                {previewError}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 gap-2">
            <div className="min-w-0 flex-1">
              <KeyboardField
                value={text}
                onChange={setText}
                placeholder="Напиши текст записки…"
                title="Текст записки"
                multiline
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-gray-900 focus:ring-2"
              />
            </div>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => {
                const next = saveGiftNoteText(text, savedTexts);
                setSavedTexts(next);
                setMessage({ ok: true, text: "Текст сохранён" });
              }}
              className="h-auto shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-900 disabled:opacity-40"
            >
              Сохранить
              <br />
              текст
            </button>
          </div>

          {savedTexts.length > 0 ? (
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {savedTexts.map((item) => (
                <div
                  key={item.id}
                  className="inline-flex max-w-full items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <button
                    type="button"
                    title={item.text}
                    onClick={() => setText(item.text)}
                    className="max-w-[11rem] truncate px-2 py-1 text-left text-[11px] font-medium text-gray-800"
                  >
                    {previewLabel(item.text)}
                  </button>
                  <button
                    type="button"
                    aria-label="Удалить сохранённый текст"
                    onClick={() => setSavedTexts(removeSavedGiftNoteText(item.id, savedTexts))}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-800"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="shrink-0 text-[11px] text-gray-400">
              Сохрани текст — он появится здесь и останется на этом устройстве
            </p>
          )}

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
                className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border bg-white text-lg leading-none ${
                  imageId === img.id ? "border-gray-900 ring-2 ring-gray-900" : "border-gray-200"
                }`}
              >
                <span aria-hidden>{img.emoji}</span>
              </button>
            ))}
          </div>

          {message ? (
            <p className={`shrink-0 text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>
              {message.text}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-gray-100 px-3 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800"
          >
            Закрыть
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void printNote()}
            className="h-10 min-w-0 flex-[1.4] rounded-xl bg-gray-900 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "…" : "Печать"}
          </button>
        </footer>
      </div>
    </div>
  );
}
