"use client";

import { useState } from "react";
import { GiftNoteModal } from "./GiftNoteModal";

/** Кнопка «записка» над вопросиком Кирилла. */
export function GiftNoteButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Записка на баркодник"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed bottom-36 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border-2 border-gray-900 bg-white text-gray-900 shadow-lg transition-transform active:scale-95 sm:bottom-40 sm:right-6 sm:h-14 sm:w-14"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-6 w-6 sm:h-7 sm:w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3h7l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M15 3v5h5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      </button>

      <GiftNoteModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
