"use client";

import type { MissingAssemblyItem } from "@/lib/assembly-status";

interface AssemblyLockedCardProps {
  missing: MissingAssemblyItem[];
}

export function AssemblyLockedCard({ missing }: AssemblyLockedCardProps) {
  if (missing.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-5 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Не хватает</p>
      <div className="mt-3 space-y-2">
        {missing.map((item) => (
          <div
            key={`${item.productName}-${item.size}`}
            className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1 pr-3">
              <p className="truncate text-sm text-gray-700">{item.productName}</p>
              <p className="text-xs text-gray-400">{item.size}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold tabular-nums text-gray-600">
              {item.have}/{item.need}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
