"use client";

import type { ShippingTab } from "@/types/shipping";

interface TabSwitcherProps {
  active: ShippingTab;
  onChange: (tab: ShippingTab) => void;
}

const TABS: { id: ShippingTab; label: string }[] = [
  { id: "assembly", label: "Сборка" },
  { id: "shipping", label: "Отправка" },
  { id: "archive", label: "Архив" },
];

export function TabSwitcher({ active, onChange }: TabSwitcherProps) {
  return (
    <div className="flex w-full rounded-2xl border border-gray-200 bg-white p-1 shadow-sm sm:inline-flex sm:w-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex-1 rounded-xl px-3 py-3 text-sm font-medium transition-colors sm:flex-none sm:px-5 sm:py-2.5 ${
            active === tab.id
              ? "bg-gray-900 text-white shadow-sm"
              : "text-gray-600 active:bg-gray-50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
