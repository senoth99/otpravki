"use client";

interface LetterPadProps {
  value: string;
  onChange: (letter: string) => void;
  disabled?: boolean;
}

const ROWS = [
  "АБВГДЕЁЖЗИЙ",
  "КЛМНОПРСТУФ",
  "ХЦЧШЩЪЫЬЭЮЯ",
  "ABCDEFGHIJKLM",
  "NOPQRSTUVWXYZ",
];

export function LetterPad({ value, onChange, disabled }: LetterPadProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white text-2xl font-bold text-gray-900">
          {value || "·"}
        </div>
      </div>
      <div className="space-y-1.5">
        {ROWS.map((row) => (
          <div key={row} className="flex flex-wrap justify-center gap-1">
            {Array.from(row).map((letter) => {
              const active = value === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(letter)}
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl border text-sm font-semibold active:scale-[0.98] disabled:opacity-40 ${
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-900"
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
