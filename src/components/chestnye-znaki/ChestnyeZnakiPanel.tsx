"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";

type Screen = "pin" | "loading" | "token" | "error";

interface TokenPayload {
  token: string;
  certSubject?: string;
  certThumbprint?: string;
  apiUrl?: string;
  uuid?: string;
}

function PinPad({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (fullPin: string) => void;
  disabled?: boolean;
}) {
  const press = (digit: string) => {
    if (disabled || value.length >= 4) return;
    const next = value + digit;
    onChange(next);
    if (next.length === 4) {
      onSubmit(next);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xs space-y-3">
      <div className="flex justify-center gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={`h-3 w-3 rounded-full ${index < value.length ? "bg-gray-900" : "bg-gray-200"}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => press(digit)}
            className="h-14 rounded-xl border border-gray-200 bg-white text-xl font-semibold text-gray-900 active:bg-gray-100 disabled:opacity-40"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => onChange("")}
          className="h-14 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-40"
        >
          Сброс
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => press("0")}
          className="h-14 rounded-xl border border-gray-200 bg-white text-xl font-semibold text-gray-900 active:bg-gray-100 disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
          className="h-14 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-40"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

export function ChestnyeZnakiPanel() {
  useOtpravkiNoSwipe();
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("pin");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<TokenPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/otpravki");
  };

  const fetchToken = useCallback(async () => {
    setBusy(true);
    setError(null);
    setScreen("loading");
    try {
      const res = await fetch("/api/chestnye-znaki/token", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        token?: string;
        certSubject?: string;
        certThumbprint?: string;
        apiUrl?: string;
        uuid?: string;
      };
      if (!res.ok || !data.ok || !data.token) {
        throw new Error(data.error ?? "Не удалось получить токен");
      }
      setPayload({
        token: data.token,
        certSubject: data.certSubject,
        certThumbprint: data.certThumbprint,
        apiUrl: data.apiUrl,
        uuid: data.uuid,
      });
      setScreen("token");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setScreen("error");
    } finally {
      setBusy(false);
    }
  }, []);

  const submitPin = useCallback(
    async (enteredPin: string) => {
      if (enteredPin.length !== 4 || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/chestnye-znaki/verify-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: enteredPin }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Неверный PIN");
        }
        setPin("");
        await fetchToken();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка");
        setScreen("error");
        setPin("");
      } finally {
        setBusy(false);
      }
    },
    [busy, fetchToken],
  );

  const copyToken = async () => {
    if (!payload?.token) return;
    await navigator.clipboard.writeText(payload.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="otpravki-shell flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50">
      <header className="safe-top shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 active:bg-gray-50"
          >
            Назад
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Честные знаки</h1>
            <p className="text-xs text-gray-500">Тестовый доступ · session-токен True API</p>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-4">
        {screen === "pin" && (
          <div className="w-full max-w-md space-y-6 text-center">
            <div>
              <p className="text-sm font-medium text-gray-900">Введите PIN</p>
              <p className="mt-1 text-xs text-gray-500">4 цифры для доступа к модулю</p>
            </div>
            <PinPad value={pin} onChange={setPin} onSubmit={submitPin} disabled={busy} />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {screen === "loading" && (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">Получаем токен с сервера…</p>
            <p className="mt-2 text-xs text-gray-500">КриптоПро · токен АНГАРА · True API</p>
          </div>
        )}

        {screen === "token" && payload && (
          <div className="w-full max-w-2xl space-y-4">
            <div className="rounded-2xl border border-green-200 bg-green-50/70 p-4">
              <p className="text-sm font-semibold text-green-800">Токен получен</p>
              {payload.certSubject && (
                <p className="mt-1 text-xs text-gray-600">{payload.certSubject}</p>
              )}
              {payload.certThumbprint && (
                <p className="mt-0.5 font-mono text-[10px] text-gray-500">{payload.certThumbprint}</p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Session token
              </p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-gray-50 p-3 font-mono text-xs text-gray-900">
                {payload.token}
              </pre>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyToken()}
                className="inline-flex h-11 items-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white"
              >
                {copied ? "Скопировано" : "Скопировать"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setScreen("pin");
                  setPayload(null);
                }}
                className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800"
              >
                Запросить снова
              </button>
              <button
                type="button"
                onClick={goBack}
                className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800"
              >
                Назад
              </button>
            </div>
          </div>
        )}

        {screen === "error" && (
          <div className="w-full max-w-md space-y-4 text-center">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error ?? "Неизвестная ошибка"}
            </div>
            <p className="text-xs text-gray-500">
              Проверь КриптоПро, токен АНГАРА и переменные CRPT_* в .env. См. docs/CHESTNY_ZNAK_SETUP.md
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setScreen("pin");
                  setError(null);
                }}
                className="inline-flex h-11 items-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white"
              >
                Повторить
              </button>
              <button
                type="button"
                onClick={goBack}
                className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800"
              >
                Назад
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
