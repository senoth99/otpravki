"use client";

import { useState } from "react";
import type { ApiStockItem, WarehouseCell, WarehouseMapConfig } from "@/types/stock";
import { CellModal } from "./CellModal";

interface WarehouseMapProps {
  initialMap: WarehouseMapConfig;
  stock: ApiStockItem[];
}

const RACK_ROWS = 4;
const RACK_COLS = 4;
const TABLE_ROWS = 2;
const TABLE_COLS = 8;

function buildDefaultCells(): WarehouseCell[] {
  const cells: WarehouseCell[] = [];
  for (let row = 0; row < RACK_ROWS; row++) {
    for (let col = 0; col < RACK_COLS; col++) {
      cells.push({ id: `rack-${row}-${col}`, zone: "rack", row, col });
    }
  }
  for (let row = 0; row < TABLE_ROWS; row++) {
    for (let col = 0; col < TABLE_COLS; col++) {
      cells.push({ id: `table-${row}-${col}`, zone: "table", row, col });
    }
  }
  return cells;
}

function mergeCells(
  defaults: WarehouseCell[],
  saved: WarehouseCell[]
): WarehouseCell[] {
  const map = new Map(saved.map((c) => [c.id, c]));
  return defaults.map((d) => map.get(d.id) ?? d);
}

export function WarehouseMap({ initialMap, stock }: WarehouseMapProps) {
  const defaults = buildDefaultCells();
  const [cells, setCells] = useState<WarehouseCell[]>(() =>
    mergeCells(defaults, initialMap.cells)
  );
  const [selectedCell, setSelectedCell] = useState<WarehouseCell | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function getCell(id: string): WarehouseCell {
    return cells.find((c) => c.id === id) ?? defaults.find((c) => c.id === id)!;
  }

  function handleCellSave(updated: WarehouseCell) {
    setCells((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedCell(null);
  }

  async function handleSaveMap() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/warehouse-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cells, updatedAt: Date.now() } satisfies WarehouseMapConfig),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  function renderCell(cell: WarehouseCell) {
    const hasProduct = Boolean(cell.productSlug);
    return (
      <button
        key={cell.id}
        type="button"
        onClick={() => setSelectedCell(cell)}
        className={`flex min-h-[56px] flex-col items-start justify-center gap-0.5 rounded-lg border p-1.5 text-left transition-colors ${
          hasProduct
            ? "border-blue-200 bg-blue-50 hover:bg-blue-100"
            : "border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100"
        }`}
      >
        {hasProduct ? (
          <>
            <span className="line-clamp-2 text-[10px] font-medium leading-tight text-blue-900">
              {cell.productName}
            </span>
            {cell.sizes && cell.sizes.length > 0 && (
              <span className="text-[9px] leading-tight text-blue-600">
                {cell.sizes.join(", ")}
              </span>
            )}
            {cell.label && (
              <span className="text-[9px] italic leading-tight text-blue-500">
                {cell.label}
              </span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-gray-400">
            {cell.label ?? ""}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSaveMap}
          disabled={saving}
          className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {saving ? "Сохранение..." : "Сохранить карту"}
        </button>
        {saveError && (
          <span className="text-xs text-red-500">{saveError}</span>
        )}
        {savedAt && !saveError && (
          <span className="text-xs text-green-600">Сохранено</span>
        )}
      </div>

      {/* Layout: rack left, table right on desktop; stacked on mobile */}
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* RACK */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Стеллаж
          </h3>
          <div className="flex gap-2">
            {/* Row labels */}
            <div className="flex flex-col gap-1.5 pt-0">
              {Array.from({ length: RACK_ROWS }, (_, row) => (
                <div
                  key={row}
                  className="flex h-[56px] w-7 items-center justify-center text-[10px] font-medium text-gray-400"
                >
                  Р{row + 1}
                </div>
              ))}
            </div>
            {/* Grid */}
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${RACK_COLS}, minmax(64px, 1fr))` }}
            >
              {Array.from({ length: RACK_ROWS }, (_, row) =>
                Array.from({ length: RACK_COLS }, (_, col) => {
                  const id = `rack-${row}-${col}`;
                  return renderCell(getCell(id));
                })
              )}
            </div>
          </div>
        </div>

        {/* TABLE */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Стол
          </h3>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${TABLE_COLS}, minmax(56px, 1fr))` }}
          >
            {Array.from({ length: TABLE_ROWS }, (_, row) =>
              Array.from({ length: TABLE_COLS }, (_, col) => {
                const id = `table-${row}-${col}`;
                return renderCell(getCell(id));
              })
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-blue-200 bg-blue-50" />
          Занято
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-dashed border-gray-300 bg-gray-50" />
          Свободно
        </span>
      </div>

      {/* Cell modal */}
      {selectedCell && (
        <CellModal
          cell={selectedCell}
          stock={stock}
          onSave={handleCellSave}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  );
}
