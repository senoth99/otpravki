"use client";

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import {
  CLIENT_ERROR_EVENT,
  markClientAlive,
  noteClientAction,
  readClientDiag,
  reportClientError,
} from "@/lib/client-diag";
import { logClientSync } from "@/lib/workspace";

function formatUnknown(reason: unknown): string {
  if (reason instanceof Error) {
    return [reason.name, reason.message, reason.stack].filter(Boolean).join("\n");
  }
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/** SSR/клиент рассинхрон — React сам перерисовывает, UI ломать нельзя. */
function isHydrationNoise(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("minified react error #418") ||
    lower.includes("minified react error #423") ||
    lower.includes("minified react error #425") ||
    lower.includes("hydration failed") ||
    lower.includes("hydration mismatch") ||
    lower.includes("did not match") ||
    lower.includes("text content does not match")
  );
}

function buildReport(parts: string[]): string {
  return [
    ...parts.filter(Boolean),
    `url: ${typeof window !== "undefined" ? window.location.href : ""}`,
    `ua: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
    `time: ${new Date().toISOString()}`,
  ].join("\n");
}

function ErrorBanner({
  text,
  title,
  onClose,
}: {
  text: string;
  title: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] max-h-[45vh] overflow-auto border-b-4 border-red-600 bg-red-50 p-4 text-left shadow-2xl safe-top">
      <p className="text-xs font-bold uppercase tracking-wide text-red-800">{title}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-950">
        {text}
      </pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Скопировано" : "Скопировать"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

class ReactCrashBoundary extends Component<
  { children: ReactNode; onError: (text: string) => void },
  { crash: string | null }
> {
  state = { crash: null as string | null };

  static getDerivedStateFromError(error: Error) {
    // #418 hydration — не сносим всё дерево, иначе /sborka «мёртвая»
    if (isHydrationNoise(formatUnknown(error))) return null;
    return { crash: formatUnknown(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const text = buildReport([
      "React crash",
      formatUnknown(error),
      info.componentStack ? `componentStack:${info.componentStack}` : "",
    ]);
    if (isHydrationNoise(text)) {
      logClientSync("client.hydration", { message: text });
      return;
    }
    this.props.onError(text);
  }

  render() {
    if (this.state.crash) {
      return (
        <>
          {this.props.children}
          <ErrorBanner
            title="React упал — скопируй и пришли"
            text={buildReport([this.state.crash])}
            onClose={() => this.setState({ crash: null })}
          />
        </>
      );
    }
    return this.props.children;
  }
}

/**
 * Ловит JS-ошибки, React-краши и «вкладка умерла» (Chrome this page couldn't load).
 */
export function ClientErrorProbe({ children }: { children: ReactNode }) {
  const [errorText, setErrorText] = useState<string | null>(null);
  const [title, setTitle] = useState("JS-ошибка — скопируй и пришли");

  useEffect(() => {
    const diag = readClientDiag();
    if (diag.crashedDuring) {
      const text = buildReport([
        "Вкладка умерла в прошлый раз (Chrome «this page couldn't load»).",
        `Последнее действие: ${diag.crashedDuring}`,
        diag.savedErrors.length ? `Прошлые ошибки:\n${diag.savedErrors.join("\n")}` : "",
      ]);
      setTitle("Вкладка умерла — скопируй и пришли");
      setErrorText(text);
    }

    const show = (raw: string, meta?: Record<string, unknown>) => {
      if (isHydrationNoise(raw)) {
        logClientSync("client.hydration", { message: raw, meta });
        return;
      }
      const text = buildReport([raw]);
      setTitle("JS-ошибка — скопируй и пришли");
      setErrorText(text);
      reportClientError(raw);
      logClientSync("client.error", { message: raw, meta });
    };

    const onError = (event: ErrorEvent) => {
      const text = [
        event.message || "Unknown error",
        event.filename ? ` @ ${event.filename}:${event.lineno}:${event.colno}` : "",
        event.error instanceof Error ? event.error.stack : "",
      ]
        .filter(Boolean)
        .join("\n");
      show(text, { source: "error" });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      show(`Unhandled rejection:\n${formatUnknown(event.reason)}`, {
        source: "unhandledrejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const onReported = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.trim()) {
        if (isHydrationNoise(detail)) return;
        setTitle("Ошибка — скопируй и пришли");
        setErrorText(buildReport([detail]));
      }
    };
    window.addEventListener(CLIENT_ERROR_EVENT, onReported);
    noteClientAction("app-ready");
    markClientAlive();
    const aliveTimer = window.setInterval(markClientAlive, 2000);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener(CLIENT_ERROR_EVENT, onReported);
      window.clearInterval(aliveTimer);
    };
  }, []);

  return (
    <ReactCrashBoundary
      onError={(text) => {
        if (isHydrationNoise(text)) return;
        reportClientError(text);
        setTitle("React упал — скопируй и пришли");
        setErrorText(text);
        logClientSync("client.error", { message: text, meta: { source: "react" } });
      }}
    >
      {children}
      {errorText ? (
        <ErrorBanner text={errorText} title={title} onClose={() => setErrorText(null)} />
      ) : null}
    </ReactCrashBoundary>
  );
}
