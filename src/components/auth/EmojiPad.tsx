"use client";

interface EmojiPadProps {
  emojis: string[];
  value: string | null;
  onChange: (emoji: string) => void;
  disabled?: boolean;
  emptyHint?: string;
}

export function EmojiPad({
  emojis,
  value,
  onChange,
  disabled,
  emptyHint = "Нет свободных смайликов",
}: EmojiPadProps) {
  if (emojis.length === 0) {
    return <p className="text-center text-sm text-gray-500">{emptyHint}</p>;
  }

  return (
    <div className="grid grid-cols-5 gap-2">
      {emojis.map((emoji) => {
        const active = value === emoji;
        return (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            onClick={() => onChange(emoji)}
            className={`inline-flex h-14 items-center justify-center rounded-2xl border text-2xl active:scale-[0.98] disabled:opacity-40 ${
              active
                ? "border-gray-900 bg-gray-900/5 ring-2 ring-gray-900"
                : "border-gray-200 bg-white"
            }`}
            aria-label={`Аватар ${emoji}`}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
