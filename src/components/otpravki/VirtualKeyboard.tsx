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
      onPointerDown={(e) => {
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

interface VirtualKeyboardProps {
  /** Стартовое значение; дальше правки идут через ref без React-ререндера */
  initialValue: string;
  valueRef: React.MutableRefObject<string>;
  onClose: () => void;
  title?: string;
  keyboardRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Экранная клавиатура без setState на каждый символ.
 * Иначе Chrome на складе убивает вкладку («This page couldn't be loaded»).
 */
export function VirtualKeyboard({
  initialValue,
  valueRef,
  onClose,
  title = "Клавиатура",
  keyboardRef,
}: VirtualKeyboardProps) {
  const [layout, setLayout] = useState<KeyboardLayout>("digits");
  const displayRef = useRef<HTMLSpanElement>(null);

  const paint = useCallback(() => {
    const text = valueRef.current;
    if (displayRef.current) {
      displayRef.current.textContent = text || "…";
      displayRef.current.classList.toggle("text-gray-400", !text);
      displayRef.current.classList.toggle("text-gray-900", Boolean(text));
    }
  }, [valueRef]);

  useEffect(() => {
    valueRef.current = initialValue;
    paint();
  }, [initialValue, paint, valueRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const append = useCallback(
    (char: string) => {
      valueRef.current += char;
      paint();
    },
    [paint, valueRef],
  );

  const backspace = useCallback(() => {
    valueRef.current = valueRef.current.slice(0, -1);
    paint();
  }, [paint, valueRef]);

  const clear = useCallback(() => {
    valueRef.current = "";
    paint();
  }, [paint, valueRef]);

  const letterRows = layout === "ru" ? RU_ROWS : EN_ROWS;

  return (
    <div
      ref={keyboardRef}
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      data-no-drag-scroll
    >
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
            <div className="max-w-[55%] truncate rounded-lg bg-white px-3 py-1.5 font-mono text-sm shadow-sm">
              <span ref={displayRef} className={initialValue ? "text-gray-900" : "text-gray-400"}>
                {initialValue || "…"}
              </span>
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
              <div key={`${layout}-${rowIdx}`} className="flex gap-1.5">
                {row.map((key) => (
                  <KeyButton key={key} label={key} onPress={() => append(key)} />
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
  /** @deprecated оставлен для совместимости */
  debounceMs?: number;
  /** Применить значение только по Готово / закрытию */
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
}: KeyboardFieldProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) draftRef.current = value;
  }, [value, open]);

  const closeAndCommit = useCallback(() => {
    const next = draftRef.current;
    setOpen(false);
    if (next !== value) onChangeRef.current(next);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (keyboardRef.current?.contains(target)) return;
      closeAndCommit();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, closeAndCommit]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        inputMode="none"
        readOnly
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => {
          if (!disabled) {
            draftRef.current = value;
            setOpen(true);
          }
        }}
        onClick={() => {
          if (!disabled) {
            draftRef.current = value;
            setOpen(true);
          }
        }}
        className={className}
      />
      {open &&
        !disabled &&
        mounted &&
        createPortal(
          <VirtualKeyboard
            initialValue={value}
            valueRef={draftRef}
            onClose={closeAndCommit}
            title={title}
            keyboardRef={keyboardRef}
          />,
          document.body,
        )}
    </div>
  );
}
