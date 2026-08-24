"use client";

import { useEffect, useState, type ReactNode } from "react";
import { logClientSync } from "@/lib/workspace";

/**
 * Ловит JS-ошибки и показывает их поверх UI + пишет в /api/sync/log.
 * Нужно, чтобы на складе было видно, почему Chrome «белеет».
 */
export function ClientErrorProbe({ children }: { children: ReactNode }) {
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const show = (text: string, meta?: Record<string, unknown>) => {
      setErrorText(text);
      logClientSync("client.error", { message: text, meta });
    };

    const onError = (event: ErrorEvent) => {
      const text = [
        event.message || "Unknown error",
        event.filename ? ` @ ${event.filename}:${event.lineno}:${event.colno}` : "",
      ].join("");
      show(text, { source: "error", stack: event.error?.stack });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const text =
        reason instanceof Error
          ? `${reason.name}: ${reason.message}`
          : `Unhandled rejection: ${String(reason)}`;
      show(text, {
        source: "unhandledrejection",
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <>
      {children}
      {errorText ? (
        <div className="fixed inset-x-0 bottom-0 z-[9999] max-h-[40vh] overflow-auto border-t-4 border-red-600 bg-red-50 p-4 text-left shadow-2xl safe-bottom">
          <p className="text-xs font-bold uppercase tracking-wide text-red-800">
            JS-ошибка (напиши SENOTH / сделай скрин)
          </p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-950">
            {errorText}
          </pre>
          <button
            type="button"
            className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white"
            onClick={() => setErrorText(null)}
          >
            Закрыть
          </button>
        </div>
      ) : null}
    </>
  );
}
