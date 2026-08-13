"use client";

import { useEffect, useState } from "react";
import { PinNumpad } from "@/components/chestnye-znaki/PinNumpad";
import type { AuthLiveStats, AuthUserPublic } from "@/components/auth/AuthProvider";
import { EmojiPad } from "@/components/auth/EmojiPad";

interface RegisterScreenProps {
  onSuccess: (user: AuthUserPublic, stats: AuthLiveStats) => void;
  onBack: () => void;
}

type Step = "emoji" | "pin";

export function RegisterScreen({ onSuccess, onBack }: RegisterScreenProps) {
  const [step, setStep] = useState<Step>("emoji");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [freeEmojis, setFreeEmojis] = useState<string[]>([]);
  const [canRegister, setCanRegister] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/auth/users", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        freeEmojis?: string[];
        canRegister?: boolean;
      };
      if (cancelled) return;
      setFreeEmojis(data.freeEmojis ?? []);
      setCanRegister(Boolean(data.canRegister));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (fullPin: string) => {
    if (!emoji || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji, pin: fullPin }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        user?: AuthUserPublic;
        stats?: AuthLiveStats;
      };
      if (!res.ok || !data.ok || !data.user || !data.stats) {
        throw new Error(data.error ?? "Не удалось зарегистрироваться");
      }
      onSuccess(data.user, data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  if (!canRegister) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 p-4 text-center">
        <p className="text-sm text-gray-700">Достигнут лимит 15 аккаунтов</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 text-sm font-medium text-white"
        >
          Назад ко входу
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (step === "emoji") onBack();
            else setStep("emoji");
          }}
          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
        >
          Назад
        </button>
        <div className="text-right">
          <h1 className="text-lg font-bold text-gray-900">Регистрация</h1>
          <p className="text-xs text-gray-500">
            {step === "emoji" && "Шаг 1 · смайлик"}
            {step === "pin" && "Шаг 2 · PIN"}
          </p>
        </div>
      </div>

      {step === "emoji" && (
        <div className="space-y-4">
          <p className="text-center text-sm text-gray-600">Выберите аватар</p>
          <EmojiPad
            emojis={freeEmojis}
            value={emoji}
            onChange={setEmoji}
            disabled={busy}
          />
          <button
            type="button"
            disabled={!emoji}
            onClick={() => setStep("pin")}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-gray-900 text-sm font-medium text-white disabled:opacity-40"
          >
            Дальше
          </button>
        </div>
      )}

      {step === "pin" && (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-center text-4xl">{emoji}</p>
          <p className="text-center text-sm text-gray-500">Придумайте PIN из 4 цифр</p>
          <PinNumpad
            value={pin}
            onChange={(next) => {
              setPin(next);
              if (next.length === 4) void submit(next);
            }}
            disabled={busy}
          />
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
