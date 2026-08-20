"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AdminPinPopup } from "@/components/admin/AdminPinPopup";
import type { GuidePage } from "@/lib/guides";

interface GuidesLockContextValue {
  unlocked: boolean;
  isLocked: (slug: string) => boolean;
  requestUnlock: (after?: () => void) => void;
  toggleLock: (slug: string) => Promise<void>;
}

const GuidesLockContext = createContext<GuidesLockContextValue | null>(null);

export function useGuidesLock(): GuidesLockContextValue {
  const value = useContext(GuidesLockContext);
  if (!value) {
    throw new Error("useGuidesLock must be used within GuidesLockProvider");
  }
  return value;
}

export function LockMark({ open, className = "h-4 w-4 shrink-0" }: { open?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {open ? (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 017.5-2" />
          <rect x="5" y="11" width="14" height="10" rx="2" />
        </>
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 018 0v3" />
          <rect x="5" y="11" width="14" height="10" rx="2" />
        </>
      )}
    </svg>
  );
}

export function GuidesLockProvider({
  guides,
  onGuideLocked,
  children,
}: {
  guides: GuidePage[];
  onGuideLocked: (guide: GuidePage) => void;
  children: ReactNode;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const afterUnlock = useRef<(() => void) | null>(null);
  const locks = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const guide of guides) map.set(guide.slug, guide.locked === true);
    return map;
  }, [guides]);

  const isLocked = useCallback((slug: string) => locks.get(slug) === true, [locks]);

  const requestUnlock = useCallback(
    (after?: () => void) => {
      if (unlocked) {
        after?.();
        return;
      }
      afterUnlock.current = after ?? null;
      setPinOpen(true);
    },
    [unlocked],
  );

  const toggleLock = useCallback(
    async (slug: string) => {
      const next = !isLocked(slug);
      const res = await fetch("/api/guides", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ slug, locked: next }),
      });
      const data = (await res.json()) as { ok?: boolean; guide?: GuidePage; error?: string };
      if (!res.ok || !data.ok || !data.guide) {
        throw new Error(data.error ?? "Не удалось сменить замок");
      }
      onGuideLocked(data.guide);
    },
    [isLocked, onGuideLocked],
  );

  const value = useMemo(
    () => ({ unlocked, isLocked, requestUnlock, toggleLock }),
    [unlocked, isLocked, requestUnlock, toggleLock],
  );

  return (
    <GuidesLockContext.Provider value={value}>
      {children}
      <AdminPinPopup
        open={pinOpen}
        title="Закрытый гайд"
        description="Один код открывает все гайды с замочком до обновления страницы"
        verifyUrl="/api/guides/unlock"
        onClose={() => {
          afterUnlock.current = null;
          setPinOpen(false);
        }}
        onSuccess={() => {
          setUnlocked(true);
          const next = afterUnlock.current;
          afterUnlock.current = null;
          next?.();
        }}
      />
    </GuidesLockContext.Provider>
  );
}

export function GuideLockGate({ slug, children }: { slug: string; children: ReactNode }) {
  const { unlocked, isLocked, requestUnlock } = useGuidesLock();
  const locked = isLocked(slug);

  useEffect(() => {
    if (locked && !unlocked) requestUnlock();
  }, [locked, unlocked, requestUnlock]);

  if (locked && !unlocked) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gray-900 text-white shadow-lg shadow-gray-900/20">
          <LockMark className="h-7 w-7" />
        </div>
        <p className="mt-4 text-base font-semibold text-gray-900">Гайд закрыт</p>
        <p className="mt-1 max-w-xs text-sm text-gray-500">
          Введи код в попапе. После этого откроются все гайды с замочком.
        </p>
        <button
          type="button"
          onClick={() => requestUnlock()}
          className="mt-4 inline-flex h-11 items-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white active:bg-gray-800"
        >
          Ввести код
        </button>
      </div>
    );
  }

  return children;
}
