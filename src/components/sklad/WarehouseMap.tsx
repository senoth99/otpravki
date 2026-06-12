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

const SLOT_W = 72;
const SLOT_H = 60;
const CANVAS_W = 1600;
const CANVAS_H = 1000;

export function WarehouseMap({ initialMap, stock }: WarehouseMapProps) {
  const [furniture, setFurniture] = useState<FurnitureItem[]>(initialMap.furniture);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startMouseX: number; startMouseY: number; startCols: number; startRows: number } | null>(null);
  const [modalTarget, setModalTarget] = useState<{ furnitureId: string; cellKey: string } | null>(null);
  const [editModalTarget, setEditModalTarget] = useState<{ furnitureId: string; cellKey: string } | null>(null);
  const [openSlot, setOpenSlot] = useState<{ furnitureId: string; col: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const inner = canvasRef.current?.querySelector(".canvas-inner") as HTMLElement;
      if (!inner) return;
      const rect = inner.getBoundingClientRect();
      setFurniture((prev) =>
        prev.map((f) =>
          f.id === dragging.id
            ? { ...f, x: Math.max(0, e.clientX - rect.left - dragging.offsetX), y: Math.max(0, e.clientY - rect.top - dragging.offsetY) }
            : f
        )
      );
    }
    if (resizing) {
      const dx = e.clientX - resizing.startMouseX;
      const dy = e.clientY - resizing.startMouseY;
      const newCols = Math.min(12, Math.max(1, Math.round((dx + resizing.startCols * SLOT_W) / SLOT_W)));
      const newRows = Math.min(10, Math.max(1, Math.round((dy + resizing.startRows * SLOT_H) / SLOT_H)));
      setFurniture((prev) =>
        prev.map((f) => {
          if (f.id !== resizing.id) return f;
          const newCells: Record<string, WarehouseCell> = {};
          for (const [key, cell] of Object.entries(f.cells)) {
            const m = key.match(/^r(\d+)c(\d+)$/);
            if (!m) continue;
            if (parseInt(m[1]) <= newRows && parseInt(m[2]) <= newCols) newCells[key] = cell;
          }
          return { ...f, rows: newRows, cols: newCols, cells: newCells };
        })
      );
    }
  }, [dragging, resizing]);

  const handleMouseUp = useCallback(() => { setDragging(null); setResizing(null); }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  function addFurniture() {
    const n = furniture.filter((f) => f.type === "rack").length + 1;
    let x = 20, y = 20;
    if (furniture.length > 0) {
      const rightmost = furniture.reduce((best, f) => {
        const w = (f.rotation === "v" ? SLOT_W : f.cols * (SLOT_W + 4)) + 24;
        return Math.max(best, f.x + w + 20);
      }, 0);
      x = rightmost;
    }
    setFurniture((prev) => [...prev, { id: `rack-${Date.now()}`, type: "rack", label: `Стеллаж ${n}`, x, y, rows: 4, cols: 4, cells: {}, rotation: "h" }]);
  }

  function toggleRotation(id: string) {
    setFurniture((prev) => prev.map((f) => f.id === id ? { ...f, rotation: f.rotation === "v" ? "h" : "v" } : f));
    setOpenSlot(null);
  }

  function removeFurniture(id: string) { setFurniture((prev) => prev.filter((f) => f.id !== id)); }

  function commitLabel(id: string) {
    setFurniture((prev) => prev.map((f) => f.id === id ? { ...f, label: editingLabelValue.trim() || f.label } : f));
    setEditingLabelId(null);
  }

  function handleCellSave(furnitureId: string, cellKey: string, cell: WarehouseCell) {
    setFurniture((prev) => prev.map((f) => f.id === furnitureId ? { ...f, cells: { ...f.cells, [cellKey]: cell } } : f));
    setEditModalTarget(null);
  }

  function handleCellClear(furnitureId: string, cellKey: string) {
    setFurniture((prev) => prev.map((f) => {
      if (f.id !== furnitureId) return f;
      const cells = { ...f.cells };
      delete cells[cellKey];
      return { ...f, cells };
    }));
    setEditModalTarget(null);
    setModalTarget(null);
  }

  async function handleSaveMap() {
    await fetch("/api/warehouse-map", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ furniture, updatedAt: Date.now() }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleCellDragStart(e: React.DragEvent, furnitureId: string, cellKey: string) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ furnitureId, cellKey }));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleCellDrop(e: React.DragEvent, targetFurnitureId: string, targetCellKey: string) {
    e.preventDefault();
    setDragOver(null);
    try {
      const { furnitureId: srcId, cellKey: srcKey } = JSON.parse(e.dataTransfer.getData("text/plain")) as { furnitureId: string; cellKey: string };
      if (srcId === targetFurnitureId && srcKey === targetCellKey) return;
      setFurniture((prev) => {
        const next = prev.map((f) => ({ ...f, cells: { ...f.cells } }));
        const src = next.find((f) => f.id === srcId);
        const tgt = next.find((f) => f.id === targetFurnitureId);
        if (!src || !tgt) return prev;
        const srcCell = src.cells[srcKey];
        const tgtCell = tgt.cells[targetCellKey];
        if (tgtCell) { src.cells[srcKey] = tgtCell; tgt.cells[targetCellKey] = srcCell; }
        else { tgt.cells[targetCellKey] = srcCell; delete src.cells[srcKey]; }
        return next;
      });
    } catch { /* ignore */ }
  }

  function getFurnitureWidth(f: FurnitureItem) {
    const isV = f.rotation === "v";
    return isV ? SLOT_W + 16 : f.cols * (SLOT_W + 4) - 4 + 16;
  }

  const editModalFurniture = editModalTarget ? furniture.find((f) => f.id === editModalTarget.furnitureId) : null;
  const editModalCell = editModalFurniture ? editModalFurniture.cells[editModalTarget!.cellKey] ?? {} : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={addFurniture}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
          ＋ Стеллаж
        </button>
      </div>

      {/* Canvas wrapper — scrolls, inner has fixed size */}
      <div ref={canvasRef} className="overflow-auto rounded-2xl border border-gray-200 bg-gray-100" style={{ maxHeight: 700 }}>
        <div className="canvas-inner relative" style={{ width: CANVAS_W, height: CANVAS_H, userSelect: dragging || resizing ? "none" : undefined }}>

          {furniture.map((f) => {
            const isV = f.rotation === "v";
            const isDraggingThis = dragging?.id === f.id;
            const isResizingThis = resizing?.id === f.id;
            const fWidth = getFurnitureWidth(f);
            const isSlotOpen = openSlot?.furnitureId === f.id;
            const openCol = isSlotOpen ? openSlot!.col : null;
            const popoverOnLeft = f.x + fWidth + 220 > CANVAS_W;
            // For vertical: popover opens right always (or below)
            const slotCount = f.cols; // number of visible slots (columns)

            return (
              <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, zIndex: isDraggingThis ? 100 : 2 }}
                className="rounded-xl border border-gray-200 bg-white shadow-md"
              >
                {/* Header */}
                <div
                  onMouseDown={(e) => {
                    if (editingLabelId === f.id) return;
                    e.preventDefault();
                    const inner = canvasRef.current?.querySelector(".canvas-inner") as HTMLElement;
                    if (!inner) return;
                    const canvasRect = inner.getBoundingClientRect();
                    setDragging({ id: f.id, offsetX: f.x - (e.clientX - canvasRect.left) + f.x, offsetY: f.y - (e.clientY - canvasRect.top) + f.y });
                    // Simplified: store current offset
                    setDragging({ id: f.id, offsetX: e.clientX - canvasRect.left - f.x, offsetY: e.clientY - canvasRect.top - f.y });
                  }}
                  onDoubleClick={() => { setEditingLabelId(f.id); setEditingLabelValue(f.label); }}
                  style={{ cursor: isDraggingThis ? "grabbing" : "grab", width: fWidth }}
                  className="flex items-center justify-between rounded-t-xl bg-gray-800 px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {editingLabelId === f.id ? (
                      <input autoFocus value={editingLabelValue}
                        onChange={(e) => setEditingLabelValue(e.target.value)}
                        onBlur={() => commitLabel(f.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitLabel(f.id); if (e.key === "Escape") setEditingLabelId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="rounded bg-gray-700 px-2 py-0.5 text-xs font-medium text-white outline-none w-24"
                      />
                    ) : (
                      <span className="truncate text-xs font-medium text-white">{f.label}</span>
                    )}
                  </div>
                  {/* Rotation toggle */}
                  <button type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); toggleRotation(f.id); }}
                    title={isV ? "Горизонтально" : "Вертикально"}
                    className="ml-1 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    {isV ? "↔" : "↕"}
                  </button>
                  <button type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); removeFurniture(f.id); }}
                    className="ml-1 flex-shrink-0 rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                  >×</button>
                </div>

                {/* Top-view body */}
                <div
                  className={`p-2 ${isV ? "flex flex-col gap-1" : "flex flex-row gap-1"}`}
                  style={{ pointerEvents: isDraggingThis || isResizingThis ? "none" : undefined }}
                >
                  {Array.from({ length: slotCount }, (_, colIdx) => {
                    const colNum = colIdx + 1;
                    let filledCount = 0;
                    for (let r = 1; r <= f.rows; r++) {
                      if (f.cells[`r${r}c${colNum}`]?.productSlug) filledCount++;
                    }
                    const hasAny = filledCount > 0;
                    const isOpen = openSlot?.furnitureId === f.id && openSlot?.col === colNum;

                    return (
                      <div key={colIdx}
                        onClick={() => setOpenSlot({ furnitureId: f.id, col: colNum })}
                        style={{ width: isV ? fWidth - 16 : SLOT_W, height: SLOT_H, position: "relative" }}
                        className={`flex flex-col items-center justify-center rounded-lg border cursor-pointer transition-all select-none
                          ${isOpen ? "ring-2 ring-blue-400 ring-offset-1" : ""}
                          ${hasAny ? "bg-blue-50 border-blue-200 hover:shadow" : "border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
                      >
                        {hasAny && (
                          <span style={{ position: "absolute", top: 3, right: 5 }} className="text-[9px] font-semibold text-blue-500">
                            {filledCount}/{f.rows}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 font-medium mt-auto mb-1">Я{colNum}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Column popover */}
                {isSlotOpen && openCol !== null && (
                  <div
                    style={{
                      position: "absolute",
                      top: 36,
                      ...(popoverOnLeft ? { right: fWidth + 8 } : { left: fWidth + 8 }),
                      width: 210,
                      zIndex: 200,
                    }}
                    className="bg-white rounded-xl shadow-xl border border-gray-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-800">Колонка Я{openCol}</span>
                      <button type="button" onClick={() => setOpenSlot(null)} className="text-gray-400 hover:text-gray-600 text-sm px-1">×</button>
                    </div>
                    <div className="flex flex-col gap-1.5 p-2">
                      {Array.from({ length: f.rows }, (_, rowIdx) => {
                        const rowNum = rowIdx + 1;
                        const cellKey = `r${rowNum}c${openCol}`;
                        const cell = f.cells[cellKey];
                        const hasProduct = Boolean(cell?.productSlug);
                        const isDragOverThis = dragOver === `${f.id}:${cellKey}`;
                        const isInlineOpen = modalTarget?.furnitureId === f.id && modalTarget?.cellKey === cellKey;

                        return (
                          <div key={rowIdx} className="flex items-center gap-1.5">
                            <div className="w-6 shrink-0 text-center text-[10px] font-medium text-gray-400">Р{rowNum}</div>
                            <div style={{ position: "relative", flex: 1 }}>
                              <div
                                draggable={hasProduct}
                                onDragStart={hasProduct ? (e) => handleCellDragStart(e, f.id, cellKey) : undefined}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(`${f.id}:${cellKey}`); }}
                                onDragLeave={() => setDragOver(null)}
                                onDrop={(e) => handleCellDrop(e, f.id, cellKey)}
                                onClick={() => setModalTarget({ furnitureId: f.id, cellKey })}
                                className={`flex flex-col justify-center gap-0.5 rounded-lg border p-2 cursor-pointer transition-all w-full
                                  ${isDragOverThis ? "border-2 border-blue-400 bg-blue-100"
                                    : hasProduct ? "border-blue-200 bg-blue-50 hover:shadow-sm"
                                    : "border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100"}`}
                                style={{ minHeight: 52 }}
                              >
                                {hasProduct ? (
                                  <>
                                    <span className="line-clamp-2 text-[10px] font-medium leading-tight text-blue-900">{cell!.productName}</span>
                                    {cell!.sizes && cell!.sizes.length > 0 && (
                                      <span className="text-[8px] leading-tight text-gray-500 truncate">{cell!.sizes.join(", ")}</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[10px] text-gray-300">{cell?.label ?? ""}</span>
                                )}
                              </div>

                              {/* Inline action popover */}
                              {isInlineOpen && (
                                <div
                                  style={{ position: "absolute", bottom: "100%", left: 0, zIndex: 210, marginBottom: 4 }}
                                  className="bg-white rounded-xl shadow-xl border border-gray-200 p-3 w-44 flex flex-col gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {hasProduct ? (
                                    <>
                                      <span className="text-xs font-medium text-gray-900 leading-tight">{cell!.productName}</span>
                                      {cell!.sizes && cell!.sizes.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {cell!.sizes.map((s) => (
                                            <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{s}</span>
                                          ))}
                                        </div>
                                      )}
                                      <button type="button"
                                        onClick={() => { setEditModalTarget(modalTarget); setModalTarget(null); setOpenSlot(null); }}
                                        className="w-full rounded-lg bg-gray-900 px-2 py-1.5 text-xs font-medium text-white hover:opacity-90">
                                        Изменить
                                      </button>
                                      <button type="button"
                                        onClick={() => handleCellClear(f.id, cellKey)}
                                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                                        Очистить
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-xs text-gray-400">Пусто</span>
                                      <button type="button"
                                        onClick={() => { setEditModalTarget(modalTarget); setModalTarget(null); setOpenSlot(null); }}
                                        className="w-full rounded-lg bg-gray-900 px-2 py-1.5 text-xs font-medium text-white hover:opacity-90">
                                        Назначить
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Resize handle */}
                <div
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setResizing({ id: f.id, startMouseX: e.clientX, startMouseY: e.clientY, startCols: f.cols, startRows: f.rows }); }}
                  style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, cursor: "se-resize", background: "#9ca3af", borderRadius: "3px 0 8px 0" }}
                />
              </div>
            );
          })}

          {/* Overlay to close popovers */}
          {(modalTarget !== null || openSlot !== null) && (
            <div className="fixed inset-0" style={{ zIndex: 199 }}
              onClick={() => { setModalTarget(null); setOpenSlot(null); }}
            />
          )}

          {furniture.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              Нажмите «＋ Стеллаж» чтобы добавить
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleSaveMap}
          className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity">
          Сохранить карту
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">Сохранено!</span>}
      </div>

      {/* CellModal */}
      {editModalTarget && editModalFurniture && editModalCell !== null && (
        <CellModal
          furnitureId={editModalTarget.furnitureId}
          cellKey={editModalTarget.cellKey}
          cell={editModalCell}
          furnitureLabel={editModalFurniture.label}
          stock={stock}
          onSave={handleCellSave}
          onClear={handleCellClear}
          onClose={() => setEditModalTarget(null)}
        />
      )}
    </div>
  );
}
