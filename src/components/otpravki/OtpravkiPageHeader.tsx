"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthHeaderStats } from "@/components/auth/AuthHeaderStats";

const SECTIONS = [
  { href: "/otpravki", label: "Отправки" },
  { href: "/admin", label: "Админка" },
] as const;

function SectionNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы"
      className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-gray-50 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {SECTIONS.map((section) => {
        const active =
          pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <a
            key={section.href}
            href={section.href}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors active:scale-[0.98] ${
              active
                ? "bg-gray-900 text-white shadow-sm"
                : "text-gray-600 active:bg-white"
            }`}
          >
            {section.label}
          </a>
        );
      })}
    </nav>
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
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 transition-colors active:bg-gray-50 disabled:opacity-60 sm:px-4"
    >
      <svg
        className={`h-4 w-4 shrink-0 ${busy ? "animate-spin" : ""}`}
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
      <span className="hidden sm:inline">{busy ? "Обновление…" : "Обновить"}</span>
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
}

export function OtpravkiPageHeader({
  title,
  subtitle,
  onRefresh,
  refreshing = false,
  offline = false,
  offlineMessage,
  children,
}: OtpravkiPageHeaderProps) {
  return (
    <header className="safe-top shrink-0 border-b border-gray-200 bg-white">
      <div className="space-y-3 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-gray-900">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate text-sm text-gray-500">{subtitle}</p>
            ) : null}
          </div>
          <AuthHeaderStats />
        </div>

        <div className="flex items-center gap-2">
          <SectionNav />
          <RefreshButton busy={refreshing} onClick={onRefresh} />
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
