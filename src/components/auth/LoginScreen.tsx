"use client";

import { useEffect, useState } from "react";
import { PinNumpad } from "@/components/chestnye-znaki/PinNumpad";
import type { AuthLiveStats, AuthUserPublic } from "@/components/auth/AuthProvider";
import { StageLoadingScreen } from "@/components/ui/StageLoadingScreen";

interface LoginScreenProps {
  onSuccess: (user: AuthUserPublic, stats: AuthLiveStats) => void;
  onGoRegister: () => void;
  canRegister: boolean;
}

export function LoginScreen({ onSuccess, onGoRegister, canRegister }: LoginScreenProps) {
  const [users, setUsers] = useState<AuthUserPublic[]>([]);
  const [selected, setSelected] = useState<AuthUserPublic | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/users", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; users?: AuthUserPublic[] };
        if (!cancelled && data.ok) setUsers(data.users ?? []);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitPin = async (fullPin: string) => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, pin: fullPin }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        user?: AuthUserPublic;
        stats?: AuthLiveStats;
      };
      if (!res.ok || !data.ok || !data.user || !data.stats) {
        throw new Error(data.error ?? "Неверный PIN");
      }
      onSuccess(data.user, data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-5 p-4">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-900">Вход</h1>
        <p className="mt-1 text-sm text-gray-500">Выберите аккаунт</p>
      </div>

      {loadingUsers ? (
        <StageLoadingScreen
          variant="overlay"
          labels={["собираем аккаунты", "заливаемся энергетиками", "анализируем клиентов"]}
        />
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          Пока нет аккаунтов — зарегистрируйте первый
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {users.map((account) => {
            const active = selected?.id === account.id;
            return (
              <button
                key={account.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelected(account);
                  setPin("");
                  setError(null);
                }}
                className={`flex items-center justify-center rounded-2xl border px-2 py-3 active:scale-[0.98] disabled:opacity-40 ${
                  active
                    ? "border-gray-900 bg-gray-900/5 ring-2 ring-gray-900"
                    : "border-gray-200 bg-white"
                }`}
              >
                <span className="text-4xl leading-none [font-family:'Apple_Color_Emoji','Segoe_UI_Emoji',sans-serif]">
                  {account.emoji}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-center text-4xl">{selected.emoji}</p>
          <PinNumpad
            value={pin}
            onChange={(next) => {
              setPin(next);
              if (next.length === 4) void submitPin(next);
            }}
            disabled={busy}
          />
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
        </div>
      )}

      {canRegister && (
        <button
          type="button"
          onClick={onGoRegister}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800"
        >
          Регистрация
        </button>
      )}
    </div>
  );
}
