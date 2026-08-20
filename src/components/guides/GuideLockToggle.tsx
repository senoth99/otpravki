"use client";

import { useState } from "react";
import { LockMark, useGuidesLock } from "@/components/guides/guides-lock";

export function GuideLockToggle({ slug }: { slug: string }) {
  const { isLocked, toggleLock } = useGuidesLock();
  const [busy, setBusy] = useState(false);
  const locked = isLocked(slug);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void toggleLock(slug).finally(() => setBusy(false));
      }}
      title={locked ? "Снять замок" : "Поставить замок"}
      aria-label={locked ? "Снять замок" : "Поставить замок"}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
        locked
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-500 active:bg-gray-50"
      }`}
    >
      <LockMark open={!locked} />
    </button>
  );
}
