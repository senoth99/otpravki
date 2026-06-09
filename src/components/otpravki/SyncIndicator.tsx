"use client";

interface SyncIndicatorProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingSync: number;
}

type DotColor = "red" | "yellow" | "green";

const DOT_STYLES: Record<DotColor, string> = {
  red: "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]",
  yellow: "bg-yellow-400 shadow-[0_0_4px_rgba(250,204,21,0.4)]",
  green: "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]",
};

function StatusDot({ color, label }: { color: DotColor; label: string }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full opacity-50 ${DOT_STYLES[color]}`}
      title={label}
      aria-label={label}
    />
  );
}

export function SyncIndicator({ isOnline, isSyncing, pendingSync }: SyncIndicatorProps) {
  const networkColor: DotColor = isOnline ? "green" : "red";
  const syncColor: DotColor = !isOnline
    ? "red"
    : isSyncing || pendingSync > 0
      ? "yellow"
      : "green";

  return (
    <div className="fixed top-1.5 right-3 z-50 hidden items-center gap-1 sm:flex">
      <StatusDot color={networkColor} label={isOnline ? "Интернет" : "Нет интернета"} />
      <StatusDot
        color={syncColor}
        label={
          !isOnline
            ? "Синхронизация недоступна"
            : isSyncing || pendingSync > 0
              ? "Синхронизация"
              : "Синхронизировано"
        }
      />
    </div>
  );
}
