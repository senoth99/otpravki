"use client";

import type { ShippingTab } from "@/types/shipping";

interface TabSwitcherProps {
  active: ShippingTab;
  onChange: (tab: ShippingTab) => void;
}

const TABS: { id: ShippingTab; label: string }[] = [
  { id: "shipping", label: "Отправка" },
  { id: "archive", label: "Архив" },
];

export function TabSwitcher({ active, onChange }: TabSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Раздел отправок"
      className="flex w-full rounded-2xl border border-gray-200 bg-gray-50 p-1 sm:inline-flex sm:w-auto"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-medium transition-colors active:scale-[0.98] sm:flex-none sm:px-5 ${
            active === tab.id
              ? "bg-gray-900 text-white shadow-sm"
              : "text-gray-600 active:bg-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
