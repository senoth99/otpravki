"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthHeaderStats } from "@/components/auth/AuthHeaderStats";
import type { ShippingTab } from "@/types/shipping";

function useIsEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get("embedded");
    if (explicit === "1" || explicit === "true") {
      setEmbedded(true);
      return;
    }

    try {
      setEmbedded(window.self !== window.top);
    } catch {
      setEmbedded(true);
    }
  }, []);
  return embedded;
}

function HeaderButton({
  active,
  children,
  onClick,
  href,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className = `inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border px-3.5 text-sm font-medium transition-colors active:scale-[0.98] ${
    active
      ? "border-gray-900 bg-gray-900 text-white"
      : "border-gray-200 bg-white text-gray-800 active:bg-gray-50"
  }`;

  if (href) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

function RefreshButton({
  busy,
  onClick,
}: {
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={busy ? "Обновление" : "Обновить"}
      title="Обновить"
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-800 transition-colors active:bg-gray-50 disabled:opacity-60"
    >
      <svg
        className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    </button>
  );
}

export interface OtpravkiPageHeaderProps {
  title: string;
  subtitle?: string;
  onRefresh: () => void;
  refreshing?: boolean;
  offline?: boolean;
  offlineMessage?: string;
  children?: ReactNode;
  /** Вкладки Отправка/Архив на странице /otpravki */
  shippingTab?: ShippingTab;
  onShippingTabChange?: (tab: ShippingTab) => void;
  /** Сборка: без навигации Инструкция/Отправка/Архив/Админка */
  hideNav?: boolean;
}

export function OtpravkiPageHeader({
  title,
  subtitle,
  onRefresh,
  refreshing = false,
  offline = false,
  offlineMessage,
  children,
  shippingTab,
  onShippingTabChange,
  hideNav = false,
}: OtpravkiPageHeaderProps) {
  const pathname = usePathname();
  const isEmbedded = useIsEmbedded();
  const onOtpravki = pathname === "/otpravki" || pathname.startsWith("/otpravki/");
  const adminActive = pathname === "/admin" || pathname.startsWith("/admin/");
  const guideActive =
    pathname === "/instrukciya" || pathname.startsWith("/instrukciya/");

  const shippingActive = onOtpravki && shippingTab === "shipping";
  const archiveActive = onOtpravki && shippingTab === "archive";

  if (isEmbedded) return null;

  return (
    <header className="safe-top shrink-0 border-b border-gray-200 bg-white">
      <div className="space-y-3 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-gray-900">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 truncate text-sm text-gray-500">{subtitle}</p>
              ) : null}
            </div>
            <RefreshButton busy={refreshing} onClick={onRefresh} />
          </div>

          {!hideNav ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <HeaderButton href="/instrukciya" active={guideActive}>
                Инструкция
              </HeaderButton>
              {onShippingTabChange ? (
                <>
                  <HeaderButton
                    active={shippingActive}
                    onClick={() => onShippingTabChange("shipping")}
                  >
                    Отправка
                  </HeaderButton>
                  <HeaderButton
                    active={archiveActive}
                    onClick={() => onShippingTabChange("archive")}
                  >
                    Архив
                  </HeaderButton>
                </>
              ) : (
                <>
                  <HeaderButton href="/otpravki">Отправка</HeaderButton>
                  <HeaderButton href="/otpravki?tab=archive">Архив</HeaderButton>
                </>
              )}
              <HeaderButton href="/admin" active={adminActive}>
                Админка
              </HeaderButton>
              <AuthHeaderStats />
            </div>
          ) : null}
        </div>

        {offline && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
            {offlineMessage ?? "Нет связи с сервером"}
          </div>
        )}

        {children}
      </div>
    </header>
  );
}
