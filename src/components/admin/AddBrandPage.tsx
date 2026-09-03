"use client";

import { useState, useEffect } from "react";
import { mutatingApiHeaders } from "@/lib/api-headers";

export function AddBrandPage() {
  const [invite, setInvite] = useState("");
  useEffect(() => {
    setInvite(new URLSearchParams(window.location.search).get("invite")?.trim() ?? "");
  }, []);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        ...mutatingApiHeaders(),
        "Content-Type": "application/json",
      };
      if (invite) headers["x-brand-invite"] = invite;
      const res = await fetch("/api/admin/brands", {
        method: "POST",
        headers,
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; brand?: { label?: string } };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Не удалось добавить");
      setDone(data.brand?.label ?? "бренд");
      setToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Добавить бренд</h1>
        <p className="mt-1 text-sm text-gray-500">Вставь токен производства Amarix</p>
      </div>
      {done ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Добавлен {done}. Можно закрыть страницу.
        </p>
      ) : (
        <>
          <input
            type="text"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="csh_at_…"
            autoCapitalize="off"
            autoCorrect="off"
            className="min-h-12 w-full rounded-2xl border border-gray-200 px-4 text-base"
          />
          <button
            type="button"
            disabled={busy || !token.trim()}
            onClick={() => void submit()}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gray-900 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Проверяю…" : "Добавить"}
          </button>
        </>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
