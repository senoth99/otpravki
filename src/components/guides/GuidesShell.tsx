"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GuidesLockProvider, LockMark, useGuidesLock } from "@/components/guides/guides-lock";
import { useOtpravkiNoSwipe } from "@/hooks/useOtpravkiNoSwipe";
import type { GuidePage } from "@/lib/guides";

const SIDEBAR_KEY = "gaidy-sidebar-open";

function topicMark(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return (title.trim().slice(0, 1) || "?").toUpperCase();
}

function Chevron({ left }: { left?: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {left ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      )}
    </svg>
  );
}

export function GuidesShell({
  initialGuides,
  children,
}: {
  initialGuides: GuidePage[];
  children: ReactNode;
}) {
  useOtpravkiNoSwipe();
  const pathname = usePathname();
  const router = useRouter();
  const activeSlug = pathname.startsWith("/gaidy/") ? pathname.slice("/gaidy/".length) : "";
  const [guides, setGuides] = useState(initialGuides);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setGuides(initialGuides);
  }, [initialGuides]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored === "0") setSidebarOpen(false);
      if (stored === "1") setSidebarOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (!activeSlug) return;
    const mobile = window.matchMedia("(max-width: 1023px)");
    if (mobile.matches) setSidebarOpen(false);
  }, [activeSlug]);

  const expandAndCreate = () => {
    setSidebarOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 180);
  };

  const createGuide = async () => {
    const nextTitle = title.trim() || "Новая тема";
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guides", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const data = (await res.json()) as { ok?: boolean; guide?: GuidePage; error?: string };
      if (!res.ok || !data.ok || !data.guide) {
        throw new Error(data.error ?? "Не удалось создать тему");
      }
      setGuides((prev) =>
        prev.some((guide) => guide.slug === data.guide!.slug) ? prev : [...prev, data.guide!],
      );
      setTitle("");
      router.push(`/gaidy/${data.guide.slug}`);
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setBusy(false);
    }
  };

  const submitNew = (event: FormEvent) => {
    event.preventDefault();
    void createGuide();
  };

  const onGuideLocked = (guide: GuidePage) => {
    setGuides((prev) =>
      prev.map((row) => (row.slug === guide.slug ? { ...row, locked: guide.locked } : row)),
    );
  };

  return (
    <GuidesLockProvider guides={guides} onGuideLocked={onGuideLocked}>
      <div className="otpravki-shell relative flex h-dvh max-h-dvh w-full overflow-hidden bg-gray-50">
      {/* Мобильный оверлей поверх статьи */}
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="absolute inset-0 z-20 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`absolute inset-y-0 left-0 z-30 flex h-full flex-col overflow-hidden border-r border-gray-200 bg-white transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          sidebarOpen
            ? "w-[min(100%,18.5rem)] translate-x-0"
            : "w-[min(100%,18.5rem)] -translate-x-full lg:w-[4.25rem] lg:translate-x-0"
        }`}
      >
        <div
          className={`safe-top flex shrink-0 items-center ${
            sidebarOpen ? "justify-between px-3 py-3" : "justify-center px-2 py-3"
          }`}
        >
          {sidebarOpen ? (
            <p className="text-sm font-semibold text-gray-900">Гайды</p>
          ) : (
            <span className="sr-only">Гайды</span>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Свернуть меню" : "Развернуть меню"}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 active:bg-gray-50"
          >
            <Chevron left={sidebarOpen} />
          </button>
        </div>

        {sidebarOpen ? (
          <form
            onSubmit={submitNew}
            data-no-drag-scroll
            className="shrink-0 border-b border-gray-100 p-2"
          >
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1">
              <input
                ref={inputRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Название темы"
                disabled={busy}
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-gray-900 outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                aria-label="Создать тему"
                className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-gray-900 text-xl leading-none text-white disabled:opacity-50"
              >
                {busy ? "…" : "+"}
              </button>
            </div>
            {error ? <p className="mt-2 px-1 text-xs text-red-600">{error}</p> : null}
          </form>
        ) : (
          <div className="hidden shrink-0 justify-center border-b border-gray-100 py-2 lg:flex">
            <button
              type="button"
              onClick={expandAndCreate}
              aria-label="Новая тема"
              title="Новая тема"
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-gray-900 text-lg leading-none text-white active:bg-gray-800"
            >
              +
            </button>
          </div>
        )}

        <nav
          className={`min-h-0 flex-1 touch-scroll-y space-y-1 overflow-y-auto p-2 ${
            sidebarOpen ? "" : "hidden lg:block"
          }`}
        >
          {guides.length === 0 && sidebarOpen ? (
            <p className="px-2 py-3 text-sm text-gray-400">
              Пока пусто — плюсик справа создаёт страницу
            </p>
          ) : null}
          <GuidesNavList guides={guides} sidebarOpen={sidebarOpen} activeSlug={activeSlug} />
        </nav>
      </aside>

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col touch-scroll-y overflow-y-auto overscroll-contain">
        {!sidebarOpen ? (
          <div className="safe-top sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-gray-200 bg-gray-50/95 px-3 py-2 backdrop-blur lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Открыть меню гайдов"
              className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800 active:bg-gray-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <p className="min-w-0 truncate text-sm font-semibold text-gray-900">Гайды</p>
          </div>
        ) : null}
        {children}
      </main>
    </div>
    </GuidesLockProvider>
  );
}

function GuidesNavList({
  guides,
  sidebarOpen,
  activeSlug,
}: {
  guides: GuidePage[];
  sidebarOpen: boolean;
  activeSlug: string;
}) {
  const router = useRouter();
  const { unlocked, isLocked, requestUnlock, toggleLock } = useGuidesLock();
  const [lockBusy, setLockBusy] = useState<string | null>(null);

  const openGuide = (guide: GuidePage) => {
    const href = `/gaidy/${guide.slug}`;
    if (!isLocked(guide.slug) || unlocked) {
      router.push(href);
      return;
    }
    requestUnlock(() => router.push(href));
  };

  const onToggleLock = async (slug: string) => {
    if (lockBusy) return;
    setLockBusy(slug);
    try {
      await toggleLock(slug);
    } finally {
      setLockBusy(null);
    }
  };

  return (
    <>
      {guides.map((guide) => {
        const active = guide.slug === activeSlug;
        const locked = isLocked(guide.slug);
        if (!sidebarOpen) {
          return (
            <div key={guide.slug} className="relative mx-auto">
              <button
                type="button"
                title={guide.title}
                onClick={() => openGuide(guide)}
                className={`flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-bold ${
                  active
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 active:bg-gray-200"
                }`}
              >
                {topicMark(guide.title)}
              </button>
              {locked ? (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-white">
                  <LockMark className="h-2.5 w-2.5" open={unlocked} />
                </span>
              ) : null}
            </div>
          );
        }
        return (
          <div
            key={guide.slug}
            className={`flex items-center gap-0.5 rounded-2xl ${
              active ? "bg-gray-900 text-white" : "text-gray-800"
            }`}
          >
            <button
              type="button"
              onClick={() => openGuide(guide)}
              className={`flex min-w-0 flex-1 items-center gap-2 px-3.5 py-3 text-left text-sm font-medium ${
                active ? "" : "active:bg-gray-50"
              }`}
            >
              {locked ? <LockMark open={unlocked} /> : null}
              <span className="truncate">{guide.title}</span>
            </button>
            <button
              type="button"
              onClick={() => void onToggleLock(guide.slug)}
              disabled={lockBusy === guide.slug}
              title={locked ? "Снять замок" : "Поставить замок"}
              aria-label={locked ? "Снять замок" : "Поставить замок"}
              className={`mr-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                active
                  ? "text-white/80 active:bg-white/10"
                  : locked
                    ? "text-gray-900 active:bg-gray-100"
                    : "text-gray-400 active:bg-gray-100 active:text-gray-800"
              }`}
            >
              <LockMark open={!locked} />
            </button>
          </div>
        );
      })}
    </>
  );
}
