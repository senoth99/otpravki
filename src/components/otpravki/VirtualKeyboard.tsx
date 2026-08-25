"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type KeyboardLayout = "digits" | "en" | "ru";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const EN_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M", "-"],
];
const RU_ROWS = [
  ["Й", "Ц", "У", "К", "Е", "Н", "Г", "Ш", "Щ", "З", "Х"],
  ["Ф", "Ы", "В", "А", "П", "Р", "О", "Л", "Д", "Ж", "Э"],
  ["Я", "Ч", "С", "М", "И", "Т", "Ь", "Б", "Ю", "-"],
];

function KeyButton({
  label,
  onPress,
  className = "",
  active,
}: {
  label: string;
  onPress: () => void;
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      // Не забираем фокус у input — чтобы работала обычная клавиатура.
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
      className={`inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white text-base font-semibold text-gray-900 shadow-sm active:scale-[0.98] active:bg-gray-900 active:text-white sm:h-14 ${
        active ? "!bg-gray-900 !text-white" : ""
      } ${className}`}
    >
      {label}
    </button>
  );
}

type KeyHandlers = {
  append: (char: string) => void;
  backspace: () => void;
  clear: () => void;
};

/** Сетка клавиш — memo, не перерисовывается при наборе текста. */
const Keypad = memo(function Keypad({
  layout,
  setLayout,
  handlersRef,
}: {
  layout: KeyboardLayout;
  setLayout: (next: KeyboardLayout) => void;
  handlersRef: React.RefObject<KeyHandlers>;
}) {
  const letterRows = layout === "ru" ? RU_ROWS : EN_ROWS;
  return (
    <>
      <div className="flex gap-1.5">
        {DIGITS.map((digit) => (
          <KeyButton
            key={digit}
            label={digit}
            onPress={() => handlersRef.current.append(digit)}
            className="text-lg"
          />
        ))}
      </div>

      {layout !== "digits" &&
        letterRows.map((row, rowIdx) => (
          <div key={`${layout}-${rowIdx}`} className="flex gap-1.5">
            {row.map((key) => (
              <KeyButton
                key={key}
                label={key}
                onPress={() => handlersRef.current.append(key)}
              />
            ))}
          </div>
        ))}

      <div className="grid grid-cols-6 gap-1.5">
        <KeyButton
          label="123"
          onPress={() => setLayout("digits")}
          active={layout === "digits"}
        />
        <KeyButton label="ABC" onPress={() => setLayout("en")} active={layout === "en"} />
        <KeyButton label="АБВ" onPress={() => setLayout("ru")} active={layout === "ru"} />
        <KeyButton label="␣" onPress={() => handlersRef.current.append(" ")} />
        <KeyButton label="⌫" onPress={() => handlersRef.current.backspace()} />
        <KeyButton
          label="✕"
          onPress={() => handlersRef.current.clear()}
          className="!text-red-700"
        />
      </div>
    </>
  );
});

interface VirtualKeyboardProps {
  draft: string;
  onDraftChange: (next: string) => void;
  onClose: () => void;
  title?: string;
  multiline?: boolean;
}

export function VirtualKeyboard({
  draft,
  onDraftChange,
  onClose,
  title = "Клавиатура",
  multiline = false,
}: VirtualKeyboardProps) {
  const [layout, setLayout] = useState<KeyboardLayout>(multiline ? "ru" : "digits");
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const handlersRef = useRef<KeyHandlers>({
    append: () => undefined,
    backspace: () => undefined,
    clear: () => undefined,
  });
  handlersRef.current = {
    append: (char) => onDraftChange(draftRef.current + char),
    backspace: () => onDraftChange(draftRef.current.slice(0, -1)),
    clear: () => onDraftChange(""),
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      // Enter без Shift закрывает однострочное поле; в multiline — перевод строки через input.
      if (event.key === "Enter" && !event.shiftKey && !multiline) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, multiline]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end" data-no-drag-scroll>
      <button
        type="button"
        aria-label="Закрыть клавиатуру"
        className="absolute inset-0 bg-black/25"
        onClick={onClose}
      />
      <div className="relative border-t border-gray-200 bg-gray-100 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] safe-bottom">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wide text-gray-500">
              {title}
            </p>
            <div className="max-w-[55%] truncate whitespace-pre rounded-lg bg-white px-3 py-1.5 font-mono text-sm text-gray-900 shadow-sm">
              {draft || <span className="text-gray-400">…</span>}
            </div>
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={onClose}
              className="h-10 shrink-0 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white"
            >
              Готово
            </button>
          </div>

          {multiline ? (
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => handlersRef.current.append("\n")}
              className="flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900 shadow-sm active:bg-gray-900 active:text-white"
            >
              ↵ Новая строка
            </button>
          ) : null}

          <Keypad layout={layout} setLayout={setLayout} handlersRef={handlersRef} />
        </div>
      </div>
    </div>
  );
}

interface KeyboardFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  debounceMs?: number;
  applyOnCloseOnly?: boolean;
  multiline?: boolean;
  rows?: number;
}

/** Поле ввода: экранная клавиатура + обычная физическая. */
export function KeyboardField({
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
  title,
  multiline = false,
  rows = 3,
}: KeyboardFieldProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  const closeAndCommit = useCallback(() => {
    setOpen(false);
    onChangeRef.current(draft);
  }, [draft]);

  const openKeyboard = () => {
    if (disabled) return;
    setDraft(value);
    setOpen(true);
  };

  const sharedProps = {
    ref: inputRef as never,
    value: open ? draft : value,
    disabled,
    placeholder,
    // text — системная/физическая клавиатура; экранная остаётся поверх.
    inputMode: "text" as const,
    autoComplete: "off" as const,
    autoCorrect: "off" as const,
    spellCheck: false,
    onFocus: openKeyboard,
    onClick: openKeyboard,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const next = event.target.value;
      setDraft(next);
      if (!open) onChangeRef.current(next);
      else onChangeRef.current(next);
    },
    className,
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea {...sharedProps} rows={rows} />
      ) : (
        <input type="text" {...sharedProps} />
      )}
      {open &&
        !disabled &&
        mounted &&
        createPortal(
          <VirtualKeyboard
            draft={draft}
            onDraftChange={(next) => {
              setDraft(next);
              onChangeRef.current(next);
            }}
            onClose={closeAndCommit}
            title={title}
            multiline={multiline}
          />,
          document.body,
        )}
    </div>
  );
}
