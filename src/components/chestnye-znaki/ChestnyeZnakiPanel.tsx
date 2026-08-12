"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PinNumpad } from "@/components/chestnye-znaki/PinNumpad";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";

type Screen = "pin" | "list" | "loading" | "error";

interface KmItem {
  sgtin: string;
  cis: string;
  gtin?: string;
  status?: string;
  emissionDate?: string;
  introducedDate?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU");
  } catch {
    return iso;
  }
}

function shortCis(cis: string): string {
  if (cis.length <= 28) return cis;
  return `${cis.slice(0, 14)}…${cis.slice(-8)}`;
}

export function ChestnyeZnakiPanel() {
  useOtpravkiNoSwipe();
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("pin");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<KmItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/otpravki");
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  };

  const loadKm = useCallback(async () => {
    setBusy(true);
    setError(null);
    setScreen("loading");
    try {
      const res = await fetch("/api/chestnye-znaki/km/search", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        items?: KmItem[];
        totalFetched?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Не удалось загрузить КМ");
      }
      setItems(data.items ?? []);
      setScreen("list");
      showToast(`Загружено: ${data.totalFetched ?? data.items?.length ?? 0}`);
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
        await loadKm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка");
        setScreen("error");
        setPin("");
      } finally {
        setBusy(false);
      }
    },
    [busy, loadKm],
  );

  const printKm = async (item: KmItem) => {
    setRowBusy(item.cis);
    try {
      const res = await fetch("/api/chestnye-znaki/km/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cis: item.cis, gtin: item.gtin }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; printer?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Ошибка печати");
      }
      showToast(`Напечатано${data.printer ? ` · ${data.printer}` : ""}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Ошибка печати");
    } finally {
      setRowBusy(null);
    }
  };

  const writeOffKm = async (item: KmItem) => {
    const ok = window.confirm(
      `Списать код?\n\nGTIN: ${item.gtin ?? "—"}\n${shortCis(item.cis)}\n\nДействие необратимо в Честном знаке.`,
    );
    if (!ok) return;

    setRowBusy(item.cis);
    try {
      const res = await fetch("/api/chestnye-znaki/km/write-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cisList: [item.cis], reason: "OTHER" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; docId?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Ошибка списания");
      }
      setItems((prev) => prev.filter((row) => row.cis !== item.cis));
      showToast(`Списано · док. ${data.docId?.slice(0, 8) ?? "OK"}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Ошибка списания");
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="otpravki-shell flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-gray-50">
      <header className="safe-top shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex h-9 shrink-0 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 active:bg-gray-50"
            >
              Назад
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-gray-900">Честные знаки</h1>
              <p className="text-xs text-gray-500">Активные КМ · печать и списание</p>
            </div>
          </div>
          {screen === "list" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadKm()}
              className="inline-flex h-9 shrink-0 items-center rounded-xl bg-gray-900 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              Обновить
            </button>
          )}
        </div>
      </header>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
          <div className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
        {screen === "pin" && (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-6 text-center">
            <div>
              <p className="text-sm font-medium text-gray-900">Введите PIN</p>
              <p className="mt-1 text-xs text-gray-500">4 цифры для доступа к модулю</p>
            </div>
            <PinNumpad
              value={pin}
              onChange={(next) => {
                setPin(next);
                if (next.length === 4) void submitPin(next);
              }}
              disabled={busy}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {screen === "loading" && (
          <div className="flex flex-1 items-center justify-center text-center">
            <div>
              <p className="text-sm font-medium text-gray-900">Загружаем активные КМ…</p>
              <p className="mt-2 text-xs text-gray-500">True API · статус INTRODUCED · lp</p>
            </div>
          </div>
        )}

        {screen === "list" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">
                В обороте: {items.length}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Коды со статусом INTRODUCED на балансе организации
              </p>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                Активных кодов маркировки не найдено
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-gray-200 bg-white">
                <ul className="divide-y divide-gray-100">
                  {items.map((item) => {
                    const busyRow = rowBusy === item.cis;
                    return (
                      <li key={item.cis} className="p-3 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-semibold text-gray-900">
                              {item.gtin ?? "—"}
                            </p>
                            <p className="mt-1 break-all font-mono text-[11px] leading-snug text-gray-600">
                              {shortCis(item.cis)}
                            </p>
                            <p className="mt-2 text-[11px] text-gray-400">
                              Ввод: {formatDate(item.introducedDate ?? item.emissionDate)} ·{" "}
                              {item.status ?? "INTRODUCED"}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              disabled={busyRow}
                              onClick={() => void printKm(item)}
                              className="inline-flex h-10 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 disabled:opacity-50"
                            >
                              {busyRow ? "…" : "Печать"}
                            </button>
                            <button
                              type="button"
                              disabled={busyRow}
                              onClick={() => void writeOffKm(item)}
                              className="inline-flex h-10 items-center rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 disabled:opacity-50"
                            >
                              Списать
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {screen === "error" && (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-4 text-center">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error ?? "Неизвестная ошибка"}
            </div>
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
