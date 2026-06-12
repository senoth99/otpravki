"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  ApiStockItem,
  FurnitureItem,
  WarehouseCell,
  WarehouseMapConfig,
} from "@/types/stock";
import { CellModal } from "./CellModal";

interface WarehouseMapProps {
  initialMap: WarehouseMapConfig;
  stock: ApiStockItem[];
}

const CELL_W = 80;
const CELL_H = 64;

export function WarehouseMap({ initialMap, stock }: WarehouseMapProps) {
  const [furniture, setFurniture] = useState<FurnitureItem[]>(
    initialMap.furniture
  );
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startCols: number;
    startRows: number;
  } | null>(null);
  const [modalTarget, setModalTarget] = useState<{
    furnitureId: string;
    cellKey: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null); // "furnitureId:cellKey"
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

  // Mouse move / up handlers attached to window
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragging) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const newX = e.clientX - rect.left - dragging.offsetX;
        const newY = e.clientY - rect.top - dragging.offsetY;
        setFurniture((prev) =>
          prev.map((f) =>
            f.id === dragging.id
              ? { ...f, x: Math.max(0, newX), y: Math.max(0, newY) }
              : f
          )
        );
      }
      if (resizing) {
        const dx = e.clientX - resizing.startMouseX;
        const dy = e.clientY - resizing.startMouseY;
        const newCols = Math.min(
          12,
          Math.max(1, Math.round((dx + resizing.startCols * CELL_W) / CELL_W))
        );
        const newRows = Math.min(
          10,
          Math.max(1, Math.round((dy + resizing.startRows * CELL_H) / CELL_H))
        );
        setFurniture((prev) =>
          prev.map((f) => {
            if (f.id !== resizing.id) return f;
            // Remove cells that are out of bounds
            const newCells: Record<string, WarehouseCell> = {};
            for (const [key, cell] of Object.entries(f.cells)) {
              const match = key.match(/^r(\d+)c(\d+)$/);
              if (!match) continue;
              const r = parseInt(match[1], 10);
              const c = parseInt(match[2], 10);
              if (r <= newRows && c <= newCols) {
                newCells[key] = cell;
              }
            }
            return { ...f, rows: newRows, cols: newCols, cells: newCells };
          })
        );
      }
    },
    [dragging, resizing]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  function addFurniture(type: "rack" | "table") {
    const defaults =
      type === "rack"
        ? { rows: 4, cols: 4 }
        : { rows: 2, cols: 8 };

    // Count existing items of this type for label numbering
    const sameType = furniture.filter((f) => f.type === type);
    const n = sameType.length + 1;
    const labelBase = type === "rack" ? "Стеллаж" : "Стол";

    // Position: right edge of last item + 20, or 20,20
    let x = 20;
    let y = 20;
    if (furniture.length > 0) {
      const rightmost = furniture.reduce((best, f) => {
        const right = f.x + f.cols * CELL_W + 40; // +40 for row label column
        return right > best ? right : best;
      }, 0);
      x = rightmost + 20;
    }

    const newItem: FurnitureItem = {
      id: `${type}-${Date.now()}`,
      type,
      label: `${labelBase} ${n}`,
      x,
      y,
      ...defaults,
      cells: {},
    };
    setFurniture((prev) => [...prev, newItem]);
  }

  function removeFurniture(id: string) {
    setFurniture((prev) => prev.filter((f) => f.id !== id));
  }

  function startEditLabel(f: FurnitureItem) {
    setEditingLabelId(f.id);
    setEditingLabelValue(f.label);
  }

  function commitLabel(id: string) {
    setFurniture((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, label: editingLabelValue.trim() || f.label }
          : f
      )
    );
    setEditingLabelId(null);
  }

  function handleCellSave(
    furnitureId: string,
    cellKey: string,
    cell: WarehouseCell
  ) {
    setFurniture((prev) =>
      prev.map((f) =>
        f.id === furnitureId
          ? { ...f, cells: { ...f.cells, [cellKey]: cell } }
          : f
      )
    );
    setModalTarget(null);
  }

  function handleCellClear(furnitureId: string, cellKey: string) {
    setFurniture((prev) =>
      prev.map((f) => {
        if (f.id !== furnitureId) return f;
        const cells = { ...f.cells };
        delete cells[cellKey];
        return { ...f, cells };
      })
    );
    setModalTarget(null);
  }

  async function handleSaveMap() {
    const config: WarehouseMapConfig = {
      furniture,
      updatedAt: Date.now(),
    };
    await fetch("/api/warehouse-map", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // HTML5 drag-and-drop for cell contents
  function handleCellDragStart(
    e: React.DragEvent,
    furnitureId: string,
    cellKey: string
  ) {
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ furnitureId, cellKey })
    );
    e.dataTransfer.effectAllowed = "move";
  }

  function handleCellDrop(
    e: React.DragEvent,
    targetFurnitureId: string,
    targetCellKey: string
  ) {
    e.preventDefault();
    setDragOver(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain")) as {
        furnitureId: string;
        cellKey: string;
      };
      const { furnitureId: srcFurnitureId, cellKey: srcCellKey } = data;
      if (srcFurnitureId === targetFurnitureId && srcCellKey === targetCellKey)
        return;

      setFurniture((prev) => {
        const next = prev.map((f) => ({ ...f, cells: { ...f.cells } }));
        const srcFurniture = next.find((f) => f.id === srcFurnitureId);
        const tgtFurniture = next.find((f) => f.id === targetFurnitureId);
        if (!srcFurniture || !tgtFurniture) return prev;

        const srcCell = srcFurniture.cells[srcCellKey];
        const tgtCell = tgtFurniture.cells[targetCellKey];

        if (tgtCell) {
          // Swap
          srcFurniture.cells[srcCellKey] = tgtCell;
          tgtFurniture.cells[targetCellKey] = srcCell;
        } else {
          // Move to empty
          tgtFurniture.cells[targetCellKey] = srcCell;
          delete srcFurniture.cells[srcCellKey];
        }
        return next;
      });
    } catch {
      // ignore malformed drag data
    }
  }

  const modalFurniture = modalTarget
    ? furniture.find((f) => f.id === modalTarget.furnitureId)
    : null;
  const modalCell = modalFurniture
    ? modalFurniture.cells[modalTarget!.cellKey] ?? {}
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => addFurniture("rack")}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          ＋ Стеллаж
        </button>
        <button
          type="button"
          onClick={() => addFurniture("table")}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          ＋ Стол
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative min-h-[600px] overflow-auto rounded-2xl bg-gray-100"
        style={{ userSelect: dragging || resizing ? "none" : undefined }}
      >
        {furniture.map((f) => {
          const isDraggingThis = dragging?.id === f.id;
          const isResizingThis = resizing?.id === f.id;
          // Width = row-label column (28px) + cols * CELL_W + padding
          const bodyWidth = 28 + f.cols * CELL_W + (f.cols - 1) * 4 + 16; // 16 for padding
          return (
            <div
              key={f.id}
              style={{
                position: "absolute",
                left: f.x,
                top: f.y,
                width: bodyWidth,
                zIndex: isDraggingThis ? 100 : 1,
              }}
              className="rounded-xl border border-gray-200 bg-white shadow-md"
            >
              {/* Header */}
              <div
                onMouseDown={(e) => {
                  if (editingLabelId === f.id) return;
                  e.preventDefault();
                  const rect = (
                    e.currentTarget.parentElement as HTMLElement
                  ).getBoundingClientRect();
                  const canvas = canvasRef.current;
                  if (!canvas) return;
                  const canvasRect = canvas.getBoundingClientRect();
                  setDragging({
                    id: f.id,
                    offsetX: rect.left - canvasRect.left,
                    offsetY: rect.top - canvasRect.top,
                  });
                }}
                onDoubleClick={() => startEditLabel(f)}
                className="flex cursor-grab items-center justify-between rounded-t-xl bg-gray-800 px-3 py-2 active:cursor-grabbing"
                style={{ cursor: isDraggingThis ? "grabbing" : "grab" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-400 text-sm">
                    {f.type === "rack" ? "🔲" : "📋"}
                  </span>
                  {editingLabelId === f.id ? (
                    <input
                      autoFocus
                      value={editingLabelValue}
                      onChange={(e) => setEditingLabelValue(e.target.value)}
                      onBlur={() => commitLabel(f.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitLabel(f.id);
                        if (e.key === "Escape") setEditingLabelId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="rounded bg-gray-700 px-2 py-0.5 text-sm font-medium text-white outline-none focus:ring-1 focus:ring-gray-400 min-w-0 w-32"
                    />
                  ) : (
                    <span className="truncate text-sm font-medium text-white">
                      {f.label}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFurniture(f.id);
                  }}
                  className="ml-2 flex-shrink-0 rounded px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                >
                  ×
                </button>
              </div>

              {/* Grid body */}
              <div
                className="p-2"
                style={{
                  pointerEvents:
                    isDraggingThis || isResizingThis ? "none" : undefined,
                }}
              >
                {Array.from({ length: f.rows }, (_, rowIdx) => {
                  const rowNum = rowIdx + 1;
                  return (
                    <div key={rowIdx} className="flex items-center gap-1 mb-1">
                      {/* Row label */}
                      <div className="w-7 flex-shrink-0 text-center text-[10px] font-medium text-gray-400">
                        Р{rowNum}
                      </div>
                      {/* Cells */}
                      {Array.from({ length: f.cols }, (_, colIdx) => {
                        const colNum = colIdx + 1;
                        const cellKey = `r${rowNum}c${colNum}`;
                        const cell = f.cells[cellKey];
                        const hasProduct = Boolean(cell?.productSlug);
                        const isDragOverThis =
                          dragOver === `${f.id}:${cellKey}`;

                        return (
                          <div
                            key={colIdx}
                            draggable={hasProduct}
                            onDragStart={
                              hasProduct
                                ? (e) =>
                                    handleCellDragStart(e, f.id, cellKey)
                                : undefined
                            }
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOver(`${f.id}:${cellKey}`);
                            }}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={(e) =>
                              handleCellDrop(e, f.id, cellKey)
                            }
                            onClick={() =>
                              setModalTarget({
                                furnitureId: f.id,
                                cellKey,
                              })
                            }
                            style={{ width: CELL_W - 4, height: CELL_H - 12 }}
                            className={`flex flex-col items-start justify-center gap-0.5 rounded-lg border p-1.5 transition-all cursor-pointer
                              ${
                                isDragOverThis
                                  ? "border-2 border-blue-400 bg-blue-100"
                                  : hasProduct
                                  ? "border-blue-200 bg-blue-50 hover:shadow-sm cursor-grab"
                                  : "border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100"
                              }`}
                          >
                            {hasProduct ? (
                              <>
                                <span className="line-clamp-2 text-[10px] font-medium leading-tight text-blue-900 w-full">
                                  {cell!.productName}
                                </span>
                                {cell!.sizes && cell!.sizes.length > 0 && (
                                  <span className="text-[8px] leading-tight text-gray-500 w-full truncate">
                                    {cell!.sizes.join(", ")}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-gray-300">
                                {cell?.label ?? ""}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Resize handle */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setResizing({
                    id: f.id,
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startCols: f.cols,
                    startRows: f.rows,
                  });
                }}
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 16,
                  height: 16,
                  cursor: "se-resize",
                  background: "#9ca3af",
                  borderRadius: 3,
                }}
              />
            </div>
          );
        })}

        {furniture.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Добавьте мебель с помощью кнопок выше
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSaveMap}
          className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Сохранить карту
        </button>
        {saved && (
          <span className="text-xs text-green-600 font-medium">Сохранено!</span>
        )}
      </div>

      {/* Cell Modal */}
      {modalTarget && modalFurniture && modalCell !== null && (
        <CellModal
          furnitureId={modalTarget.furnitureId}
          cellKey={modalTarget.cellKey}
          cell={modalCell}
          furnitureLabel={modalFurniture.label}
          stock={stock}
          onSave={handleCellSave}
          onClear={handleCellClear}
          onClose={() => setModalTarget(null)}
        />
      )}
    </div>
  );
}
