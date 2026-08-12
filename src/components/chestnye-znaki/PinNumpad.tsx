"use client";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

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
      className={`inline-flex h-14 min-w-0 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white text-xl font-semibold text-gray-900 shadow-sm active:scale-[0.98] active:bg-gray-900 active:text-white ${className}`}
    >
      {label}
    </button>
  );
}

interface PinNumpadProps {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

export function PinNumpad({ value, onChange, maxLength = 4, disabled }: PinNumpadProps) {
  const append = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  };

  const backspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const clear = () => {
    if (disabled) return;
    onChange("");
  };

  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      <div className="flex justify-center gap-2">
        {Array.from({ length: maxLength }).map((_, index) => (
          <span
            key={index}
            className={`h-3 w-3 rounded-full ${index < value.length ? "bg-gray-900" : "bg-gray-200"}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {DIGITS.slice(0, 9).map((digit) => (
          <KeyButton key={digit} label={digit} onPress={() => append(digit)} />
        ))}
        <KeyButton label="⌫" onPress={backspace} className="text-lg" />
        <KeyButton label="0" onPress={() => append("0")} />
        <KeyButton label="✕" onPress={clear} className="!text-red-700" />
      </div>
    </div>
  );
}
