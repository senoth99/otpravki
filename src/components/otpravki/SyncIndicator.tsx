"use client";

interface SyncIndicatorProps {
  isServerReachable: boolean;
  isStreamConnected: boolean;
  isSyncing: boolean;
  pendingSync: number;
  serverRevision: number;
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
      className={`h-2 w-2 rounded-full sm:h-1.5 sm:w-1.5 sm:opacity-50 ${DOT_STYLES[color]}`}
      title={label}
      aria-label={label}
    />
  );
}

export function SyncIndicator({
  isServerReachable,
  isStreamConnected,
  isSyncing,
  pendingSync,
  serverRevision,
}: SyncIndicatorProps) {
  const serverColor: DotColor = isServerReachable ? "green" : "red";
  const syncColor: DotColor = !isServerReachable
    ? "red"
    : isSyncing || pendingSync > 0
      ? "yellow"
      : isStreamConnected
        ? "green"
        : "yellow";

  return (
    <div
      className="fixed top-1.5 right-3 z-50 flex items-center gap-1.5"
      title={`Ревизия ${serverRevision}`}
    >
      <StatusDot
        color={serverColor}
        label={isServerReachable ? "Сервер в сети" : "Сервер недоступен"}
      />
      <StatusDot
        color={syncColor}
        label={
          !isServerReachable
            ? "Синхронизация недоступна"
            : isSyncing || pendingSync > 0
              ? "Отправка изменений"
              : isStreamConnected
                ? "Реальное время"
                : "Подключение…"
        }
      />
      {serverRevision > 0 && (
        <span className="text-[10px] tabular-nums text-gray-400">#{serverRevision}</span>
      )}
    </div>
  );
}
