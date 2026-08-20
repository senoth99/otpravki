"use client";

import { useEffect, useState } from "react";
import { PinNumpad } from "@/components/chestnye-znaki/PinNumpad";

interface AdminPinPopupProps {
  open: boolean;
  title?: string;
  description?: string;
  verifyUrl?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminPinPopup({
  open,
  title = "PIN админа",
  description = "Это действие доступно только администратору",
  verifyUrl = "/api/admin/verify-pin",
  onClose,
  onSuccess,
}: AdminPinPopupProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin("");
    setError(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (busy) return;
      if (event.key === "Backspace") {
        event.preventDefault();
        setPin((prev) => prev.slice(0, -1));
        return;
      }
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        setPin((prev) => (prev.length >= 4 ? prev : prev + event.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const submitPin = async (entered: string) => {
    if (entered.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(verifyUrl, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ pin: entered }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Неверный PIN");
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-pin-title"
    >
      <div
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[1.75rem] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative px-5 pb-2 pt-8 text-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none text-gray-400 active:bg-gray-100 active:text-gray-900"
          >
            ×
          </button>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-white">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V7.5a4.5 4.5 0 10-9 0v3m-.75 0h10.5A1.75 1.75 0 0118.5 12.25v7A1.75 1.75 0 0116.75 21H7.25A1.75 1.75 0 015.5 19.25v-7A1.75 1.75 0 017.25 10.5z"
              />
            </svg>
          </div>
          <h2 id="admin-pin-title" className="mt-4 text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-snug text-gray-500">{description}</p>
        </div>

        <div className="px-5 py-4">
          <PinNumpad
            value={pin}
            onChange={(next) => {
              setPin(next);
              setError(null);
              if (next.length === 4) void submitPin(next);
            }}
            disabled={busy}
          />
          <p className={`mt-3 min-h-5 text-center text-sm ${error ? "text-red-600" : "text-gray-400"}`}>
            {busy ? "Проверяем…" : error ?? "4 цифры"}
          </p>
        </div>
      </div>
    </div>
  );
}
