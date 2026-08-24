"use client";

import { useEffect, useId, useState } from "react";
import { mutatingApiHeaders } from "@/lib/api-headers";

function guideUrl(slug: string): string {
  if (typeof window === "undefined") return `/gaidy/${slug}`;
  return `${window.location.origin}/gaidy/${slug}`;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function GuideQrButton({ slug, title }: { slug: string; title: string }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [printMessage, setPrintMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const url = open ? guideUrl(slug) : "";

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setDataUrl(null);
    setError(null);

    void (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const next = await QRCode.toDataURL(guideUrl(slug), {
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#111827", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(next);
      } catch {
        if (!cancelled) setError("Не удалось собрать QR");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const printQr = async () => {
    if (printBusy) return;
    setPrintBusy(true);
    setPrintMessage(null);
    try {
      const res = await fetch("/api/guides/print-qr", {
        method: "POST",
        headers: mutatingApiHeaders(),
        body: JSON.stringify({
          slug,
          origin: window.location.origin,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        printer?: string;
      };
      if (!res.ok || !data.ok) {
        setPrintMessage({
          ok: false,
          text: data.message ?? "Не удалось отправить на принтер",
        });
        return;
      }
      setPrintMessage({
        ok: true,
        text: `Отправлено на ${data.printer ?? "принтер"}`,
      });
    } catch {
      setPrintMessage({ ok: false, text: "Нет связи с сервером печати" });
    } finally {
      setPrintBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPrintMessage(null);
          setOpen(true);
        }}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 active:bg-gray-50"
        aria-label="QR-код ссылки"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10 0h2v2h-2v-2zm4-2h2v2h-2v-2zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zm-4 0h2v4h-2v-4zm4 2h2v4h-2v-4z" />
        </svg>
        QR
      </button>

      <button
        type="button"
        disabled={printBusy}
        onClick={() => void printQr()}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 active:bg-gray-50 disabled:opacity-50"
        aria-label="Распечатать QR на принтере этикеток"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 9V4h12v5M6 14H5a2 2 0 01-2-2v-1a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2h-1M6 18h12v3H6v-3z"
          />
        </svg>
        {printBusy ? "Печать…" : "Печать"}
      </button>

      {printMessage && !open ? (
        <span
          className={`max-w-[11rem] truncate text-[11px] font-medium ${
            printMessage.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {printMessage.text}
        </span>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={titleId} className="text-base font-semibold text-gray-900">
              QR темы
            </h3>
            <p className="mt-1 text-sm text-gray-600">{title}</p>

            <div className="my-4 flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-3">
              {dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dataUrl} alt={`QR ${title}`} className="h-52 w-52" />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center text-sm text-gray-400">
                  {error ?? "Собираю…"}
                </div>
              )}
            </div>

            <p className="truncate text-center font-mono text-[11px] text-gray-400">{url}</p>

            {printMessage ? (
              <p
                className={`mt-3 text-center text-xs font-medium ${
                  printMessage.ok ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {printMessage.text}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={printBusy}
                onClick={() => void printQr()}
                className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-gray-900 text-sm font-medium text-white active:bg-gray-800 disabled:opacity-50"
              >
                {printBusy ? "Печатаю…" : "Распечатать"}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-800 active:bg-gray-50"
                >
                  Закрыть
                </button>
                <button
                  type="button"
                  disabled={!dataUrl}
                  onClick={() => {
                    if (dataUrl) downloadDataUrl(dataUrl, `gaid-${slug}.png`);
                  }}
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-gray-200 text-sm font-medium text-gray-800 active:bg-gray-50 disabled:opacity-50"
                >
                  Скачать
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
