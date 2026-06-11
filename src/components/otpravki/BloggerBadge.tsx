export function BloggerBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-lg bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 ${className}`}
    >
      Блогеры
    </span>
  );
}
