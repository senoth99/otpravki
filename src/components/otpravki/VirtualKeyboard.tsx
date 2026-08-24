"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
}: {
  label: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      className={`inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white text-base font-semibold text-gray-900 shadow-sm active:scale-[0.98] active:bg-gray-900 active:text-white sm:h-14 ${className}`}
    >
      {label}
    </button>
  );
}

interface VirtualKeyboardProps {
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  title?: string;
  keyboardRef?: React.RefObject<HTMLDivElement | null>;
}

export function VirtualKeyboard({
  value,
  onChange,
  onClose,
  title = "Клавиатура",
  keyboardRef,
}: VirtualKeyboardProps) {
  const [layout, setLayout] = useState<KeyboardLayout>("digits");

  const append = useCallback(
    (char: string) => {
      onChange(value + char);
    },
    [onChange, value],
  );

  const backspace = useCallback(() => {
    onChange(value.slice(0, -1));
  }, [onChange, value]);

  const clear = useCallback(() => {
    onChange("");
  }, [onChange]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const letterRows = layout === "ru" ? RU_ROWS : EN_ROWS;

  return (
    <div ref={keyboardRef} className="fixed inset-0 z-[80] flex flex-col justify-end">
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
            <div className="max-w-[55%] truncate rounded-lg bg-white px-3 py-1.5 font-mono text-sm text-gray-900 shadow-sm">
              {value || <span className="text-gray-400">…</span>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-10 shrink-0 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white"
            >
              Готово
            </button>
          </div>

          <div className="flex gap-1.5">
            {DIGITS.map((digit) => (
              <KeyButton key={digit} label={digit} onPress={() => append(digit)} className="text-lg" />
            ))}
          </div>

          {layout !== "digits" &&
            letterRows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-1.5">
                {row.map((key) => (
                  <KeyButton key={key} label={key} onPress={() => append(key)} />
                ))}
              </div>
            ))}

          <div className="grid grid-cols-6 gap-1.5">
            <KeyButton
              label="123"
              onPress={() => setLayout("digits")}
              className={layout === "digits" ? "!bg-gray-900 !text-white" : ""}
            />
            <KeyButton
              label="ABC"
              onPress={() => setLayout("en")}
              className={layout === "en" ? "!bg-gray-900 !text-white" : ""}
            />
            <KeyButton
              label="АБВ"
              onPress={() => setLayout("ru")}
              className={layout === "ru" ? "!bg-gray-900 !text-white" : ""}
            />
            <KeyButton label="␣" onPress={() => append(" ")} />
            <KeyButton label="⌫" onPress={backspace} />
            <KeyButton label="✕" onPress={clear} className="!text-red-700" />
          </div>
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
  /**
   * Задержка перед onChange в родителя.
   * Локальный ввод обновляется сразу — иначе каждый символ
   * пересобирает тяжёлый список заказов и Chrome убивает вкладку.
   */
  debounceMs?: number;
  /**
   * Не слать onChange пока открыта клавиатура — только по «Готово» / закрытию.
   * Нужно для поиска на отправках: набор цифр не должен трогать ShippingView.
   */
  applyOnCloseOnly?: boolean;
}

/** Поле ввода с экранной клавиатурой (без системной). */
export function KeyboardField({
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
  title,
  debounceMs = 0,
  applyOnCloseOnly = false,
}: KeyboardFieldProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Внешний сброс (смена бренда / «Сбросить») — подтягиваем draft
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (applyOnCloseOnly) return;
    if (!debounceMs) return;
    if (draft === value) return;
    const timer = window.setTimeout(() => {
      onChangeRef.current(draft);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, value, debounceMs, applyOnCloseOnly]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (keyboardRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const useLocalDraft = debounceMs > 0 || applyOnCloseOnly;
  const displayValue = useLocalDraft ? draft : value;

  const commitDraft = useCallback(() => {
    if (draft !== value) onChangeRef.current(draft);
  }, [draft, value]);

  const handleChange = (next: string) => {
    if (useLocalDraft) {
      setDraft(next);
      return;
    }
    onChange(next);
  };

  const handleClose = () => {
    if (useLocalDraft) commitDraft();
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        inputMode="none"
        readOnly
        value={displayValue}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        className={className}
      />
      {open &&
        !disabled &&
        mounted &&
        createPortal(
          <VirtualKeyboard
            value={displayValue}
            onChange={handleChange}
            onClose={handleClose}
            title={title}
            keyboardRef={keyboardRef}
          />,
          document.body,
        )}
    </div>
  );
}
