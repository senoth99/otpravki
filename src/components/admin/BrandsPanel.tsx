"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mutatingApiHeaders } from "@/lib/api-headers";

interface AdminBrand {
  key: string;
  code: string;
  label: string;
  enabled: boolean;
  tokenHint: string;
}

export function BrandsPanel() {
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const knownKeysRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const loadBrands = useCallback(async (opts?: { silent?: boolean }) => {
    const res = await fetch("/api/admin/brands", { cache: "no-store" });
    const data = (await res.json()) as { ok?: boolean; brands?: AdminBrand[]; error?: string };
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Не удалось загрузить бренды");
    const next = data.brands ?? [];

    if (!initializedRef.current) {
      knownKeysRef.current = new Set(next.map((brand) => brand.key));
      initializedRef.current = true;
    } else {
      const added = next.filter((brand) => !knownKeysRef.current.has(brand.key));
      if (added.length > 0) {
        setMessage(`С телефона добавлен: ${added.map((brand) => brand.label).join(", ")}`);
        knownKeysRef.current = new Set(next.map((brand) => brand.key));
      }
    }

    setBrands(next);
    if (!opts?.silent) setError(null);
  }, []);

  useEffect(() => {
    void loadBrands().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    });
  }, [loadBrands]);

  // Пока открыт раздел — опрашиваем, чтобы увидеть бренд с телефона
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadBrands({ silent: true }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [loadBrands]);

  useEffect(() => {
    if (!showQr) {
      setQrUrl(null);
      setQrImage(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/brands/invite", {
          method: "POST",
          headers: mutatingApiHeaders(),
        });
        const data = (await res.json()) as { ok?: boolean; inviteId?: string; error?: string };
        if (!res.ok || !data.ok || !data.inviteId) {
          throw new Error(data.error ?? "Не удалось создать QR");
        }
        const url = `${window.location.origin}/admin/add-brand?invite=${encodeURIComponent(data.inviteId)}`;
        const QRCode = (await import("qrcode")).default;
        const image = await QRCode.toDataURL(url, {
          width: 360,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#111827", light: "#ffffff" },
        });
        if (cancelled) return;
        setQrUrl(url);
        setQrImage(image);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка QR");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showQr]);

  const addBrand = async () => {
    if (busy || !token.trim() || !label.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/brands", {
        method: "POST",
        headers: { ...mutatingApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), label: label.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        brand?: AdminBrand;
        message?: string;
        sync?: { ok?: boolean; ordersCount?: number; error?: string };
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Не удалось добавить");
      setToken("");
      setLabel("");
      setMessage(data.message ?? `Добавлен ${data.brand?.label ?? "бренд"}`);
      knownKeysRef.current.add(data.brand?.key ?? "");
      await loadBrands();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const toggleBrand = async (brand: AdminBrand) => {
    setError(null);
    try {
      const res = await fetch("/api/admin/brands", {
        method: "PATCH",
        headers: { ...mutatingApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ key: brand.key, enabled: !brand.enabled }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Не удалось сохранить");
      await loadBrands();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 py-2">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Добавить бренд</h2>
        <p className="mt-1 text-sm text-gray-500">
          Нужен API-ключ бренда Amarix (`csh_at_…`), не facility-ключ производства
        </p>
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Название бренда, например NEWBRAND"
          autoCapitalize="characters"
          className="mt-3 min-h-12 w-full rounded-2xl border border-gray-200 px-4 text-base text-gray-900"
        />
        <input
          type="text"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="csh_at_…"
          autoCapitalize="off"
          autoCorrect="off"
          className="mt-2 min-h-12 w-full rounded-2xl border border-gray-200 px-4 text-base text-gray-900"
        />
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={showQr}
            onChange={(event) => setShowQr(event.target.checked)}
            className="h-4 w-4"
          />
          Показать QR для ввода с телефона
        </label>
        <button
          type="button"
          disabled={busy || !token.trim() || !label.trim()}
          onClick={() => void addBrand()}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-gray-900 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Проверяю и тяну заказы…" : "Добавить"}
        </button>
        {showQr && (
          <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center">
            {qrImage ? (
              <>
                <img src={qrImage} alt="QR добавления бренда" className="mx-auto h-48 w-48" />
                <p className="mt-2 text-xs text-gray-500">
                  Ссылка 30 минут. На телефоне укажи название и токен — здесь появится уведомление.
                </p>
                {qrUrl ? <p className="mt-1 break-all text-[11px] text-gray-400">{qrUrl}</p> : null}
              </>
            ) : (
              <p className="text-sm text-gray-500">Готовлю QR…</p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Бренды</p>
        {brands.map((brand) => (
          <div
            key={brand.key}
            className="flex min-h-16 items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div>
              <p className="font-semibold text-gray-900">{brand.label}</p>
              <p className="text-xs text-gray-500">
                {brand.code} · {brand.tokenHint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggleBrand(brand)}
              className={`inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-medium ${
                brand.enabled
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border border-gray-200 bg-gray-50 text-gray-500"
              }`}
            >
              {brand.enabled ? "Вкл" : "Выкл"}
            </button>
          </div>
        ))}
        {brands.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Пока нет брендов</p>
        ) : null}
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <p className="text-xs text-gray-400">Удалить бренд нельзя — только выключить.</p>
    </div>
  );
}
