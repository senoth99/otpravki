"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
const SNAP_THRESHOLD = 12;
const LOCKED = true;
const POPOVER_W = 210;

function autoAlign(items: FurnitureItem[]): FurnitureItem[] {
  if (items.length <= 1) return items;
  const res = items.map((f) => ({ ...f }));
  for (let i = 0; i < res.length; i++) {
    for (let j = i + 1; j < res.length; j++) {
      if (Math.abs(res[i].x - res[j].x) <= SNAP_THRESHOLD) {
        const v = Math.min(res[i].x, res[j].x);
        res[i].x = v; res[j].x = v;
      }
      if (Math.abs(res[i].y - res[j].y) <= SNAP_THRESHOLD) {
        const v = Math.min(res[i].y, res[j].y);
        res[i].y = v; res[j].y = v;
      }
    }
  }
  return res;
}

function computeCanvasSize(items: FurnitureItem[]): { w: number; h: number } {
  if (items.length === 0) return { w: 800, h: 500 };
  let maxX = 0, maxY = 0;
  for (const f of items) {
    const fw = (f.rotation === "v" ? SLOT_W + 16 : f.cols * (SLOT_W + 4) - 4 + 16);
    const fh = (f.rotation === "v" ? f.cols * (SLOT_H + 4) - 4 + 16 : SLOT_H + 16) + 40;
    maxX = Math.max(maxX, f.x + fw);
    maxY = Math.max(maxY, f.y + fh);
  }
  return { w: maxX + 80, h: maxY + 80 };
}

export function WarehouseMap({ initialMap, stock }: WarehouseMapProps) {
  const [furniture, setFurniture] = useState<FurnitureItem[]>(() => autoAlign(initialMap.furniture));
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startMouseX: number; startMouseY: number; startCols: number; startRows: number } | null>(null);
  const [editModalTarget, setEditModalTarget] = useState<{ furnitureId: string; cellKey: string } | null>(null);
  const [openSlot, setOpenSlot] = useState<{ furnitureId: string; col: number } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const slotAnchorRef = useRef<HTMLElement | null>(null);
  const resizeSnapshotRef = useRef<{ id: string; cols: number; rows: number; cells: Record<string, WarehouseCell> } | null>(null);
  const dragDepthRef = useRef(0);

  const updatePopoverPos = useCallback(() => {
    const el = slotAnchorRef.current;
    if (!el || !openSlot) return;
    const f = furniture.find((item) => item.id === openSlot.furnitureId);
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const estH = (f?.rows ?? 4) * 58 + 48;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + POPOVER_W > window.innerWidth - margin) {
      left = Math.max(margin, rect.right - POPOVER_W);
    }
    if (top + estH > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - estH - 4);
    }
    setPopoverPos({ top, left });
  }, [openSlot, furniture]);

  useLayoutEffect(() => {
    if (!openSlot) return;
    updatePopoverPos();
    const canvas = canvasRef.current;
    canvas?.addEventListener("scroll", updatePopoverPos, { passive: true });
    window.addEventListener("resize", updatePopoverPos);
    window.addEventListener("scroll", updatePopoverPos, true);
    return () => {
      canvas?.removeEventListener("scroll", updatePopoverPos);
      window.removeEventListener("resize", updatePopoverPos);
      window.removeEventListener("scroll", updatePopoverPos, true);
    };
  }, [openSlot, updatePopoverPos]);

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

  const handleMouseUp = useCallback(() => {
    const snap = resizeSnapshotRef.current;
    if (resizing && snap && snap.id === resizing.id) {
      resizeSnapshotRef.current = null;
      setFurniture((prev) => {
        const current = prev.find((f) => f.id === snap.id);
        if (!current) return prev;
        const shrunk = current.cols < snap.cols || current.rows < snap.rows;
        if (!shrunk) return prev;
        const lost = Object.keys(snap.cells).some((key) => {
          const m = key.match(/^r(\d+)c(\d+)$/);
          if (!m) return false;
          if (parseInt(m[1]) > snap.rows || parseInt(m[2]) > snap.cols) return false;
          return Boolean(snap.cells[key]?.productSlug) && !current.cells[key];
        });
        if (lost && !window.confirm("Уменьшение размера удалит ячейки с товарами. Продолжить?")) {
          return prev.map((f) => f.id === snap.id ? { ...f, cols: snap.cols, rows: snap.rows, cells: { ...snap.cells } } : f);
        }
        return prev;
      });
    }
    setDragging(null);
    setResizing(null);
  }, [resizing]);

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
  }

  async function handleSaveMap() {
    const aligned = autoAlign(furniture);
    setFurniture(aligned);
    const { mutatingApiHeaders } = await import("@/lib/api-headers");
    const res = await fetch("/api/warehouse-map", {
      method: "PUT",
      headers: mutatingApiHeaders(),
      body: JSON.stringify({ furniture: aligned, updatedAt: Date.now() }),
    });
    if (!res.ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleCellDragStart(e: React.DragEvent, furnitureId: string, cellKey: string) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ furnitureId, cellKey }));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleCellDrop(e: React.DragEvent, targetFurnitureId: string, targetCellKey: string) {
    e.preventDefault();
    dragDepthRef.current = 0;
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
        if (!srcCell) return prev;
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
  const openSlotFurniture = openSlot ? furniture.find((f) => f.id === openSlot.furnitureId) : null;
  const canvasSize = computeCanvasSize(furniture);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar — hidden when locked */}
      {!LOCKED && (
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={addFurniture}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
            ＋ Стеллаж
          </button>
        </div>
      )}

      {/* Canvas wrapper — scrolls, inner sized to fit all furniture */}
      <div ref={canvasRef} className="overflow-auto rounded-2xl border border-gray-200 bg-gray-100" style={{ maxHeight: 700 }}>
        <div className="canvas-inner relative" style={{ width: canvasSize.w, height: canvasSize.h, userSelect: dragging || resizing ? "none" : undefined }}>

          {furniture.map((f) => {
            const isV = f.rotation === "v";
            const isDraggingThis = dragging?.id === f.id;
            const isResizingThis = resizing?.id === f.id;
            const fWidth = getFurnitureWidth(f);
            const slotCount = f.cols;

            return (
              <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, zIndex: isDraggingThis ? 100 : 2 }}
                className="rounded-xl border border-gray-200 bg-white shadow-md"
              >
                {/* Header */}
                <div
                  onMouseDown={LOCKED ? undefined : (e) => {
                    if (editingLabelId === f.id) return;
                    e.preventDefault();
                    const inner = canvasRef.current?.querySelector(".canvas-inner") as HTMLElement;
                    if (!inner) return;
                    const canvasRect = inner.getBoundingClientRect();
                    setDragging({ id: f.id, offsetX: e.clientX - canvasRect.left - f.x, offsetY: e.clientY - canvasRect.top - f.y });
                  }}
                  onDoubleClick={LOCKED ? undefined : () => { setEditingLabelId(f.id); setEditingLabelValue(f.label); }}
                  style={{ cursor: LOCKED ? "default" : isDraggingThis ? "grabbing" : "grab", width: fWidth }}
                  className="flex items-center justify-between rounded-t-xl bg-gray-800 px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {!LOCKED && editingLabelId === f.id ? (
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
                  {!LOCKED && (
                    <>
                      <button type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); toggleRotation(f.id); }}
                        title={isV ? "Горизонтально" : "Вертикально"}
                        className="ml-1 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >{isV ? "↔" : "↕"}</button>
                      <button type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); removeFurniture(f.id); }}
                        className="ml-1 flex-shrink-0 rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                      >×</button>
                    </>
                  )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          if (LOCKED) return;
                          if (openSlot?.furnitureId === f.id && openSlot.col === colNum) {
                            setOpenSlot(null);
                            setEditModalTarget(null);
                            return;
                          }
                          slotAnchorRef.current = e.currentTarget as HTMLElement;
                          setEditModalTarget(null);
                          setOpenSlot({ furnitureId: f.id, col: colNum });
                        }}
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


                {/* Resize handle — edit mode only */}
                {!LOCKED && (
                  <div
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); resizeSnapshotRef.current = { id: f.id, cols: f.cols, rows: f.rows, cells: { ...f.cells } }; setResizing({ id: f.id, startMouseX: e.clientX, startMouseY: e.clientY, startCols: f.cols, startRows: f.rows }); }}
                    style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, cursor: "se-resize", background: "#9ca3af", borderRadius: "3px 0 8px 0" }}
                  />
                )}
              </div>
            );
          })}

          {furniture.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              {LOCKED ? "Карта склада пуста" : "Нажмите «＋ Стеллаж» чтобы добавить"}
            </div>
          )}
        </div>
      </div>

      {/* Save — edit mode only */}
      {!LOCKED && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleSaveMap}
            className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity">
            Сохранить карту
          </button>
          {saved && <span className="text-xs text-green-600 font-medium">Сохранено!</span>}
        </div>
      )}

      {/* Column popover — fixed to clicked cell, rendered above scroll container */}
      {!LOCKED && openSlot && openSlotFurniture && typeof document !== "undefined" && createPortal(
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => { setEditModalTarget(null); setOpenSlot(null); }}
          />
          <div
            style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left, width: POPOVER_W, zIndex: 9999 }}
            className="bg-white rounded-xl shadow-xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-800">
                {openSlotFurniture.label} · Я{openSlot.col}
              </span>
              <button
                type="button"
                onClick={() => { setEditModalTarget(null); setOpenSlot(null); }}
                className="text-gray-400 hover:text-gray-600 text-sm px-1"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-1.5 p-2 max-h-[min(420px,calc(100vh-80px))] overflow-y-auto">
              {Array.from({ length: openSlotFurniture.rows }, (_, rowIdx) => {
                const rowNum = rowIdx + 1;
                const cellKey = `r${rowNum}c${openSlot.col}`;
                const cell = openSlotFurniture.cells[cellKey];
                const hasProduct = Boolean(cell?.productSlug);
                const isDragOverThis = dragOver === `${openSlotFurniture.id}:${cellKey}`;
                const dragKey = `${openSlotFurniture.id}:${cellKey}`;

                return (
                  <div key={rowIdx} className="flex items-center gap-1.5">
                    <div className="w-6 shrink-0 text-center text-[10px] font-medium text-gray-400">Р{rowNum}</div>
                    <div style={{ flex: 1 }}>
                      <div
                        draggable={hasProduct && !LOCKED}
                        onDragStart={hasProduct && !LOCKED ? (e) => handleCellDragStart(e, openSlotFurniture.id, cellKey) : undefined}
                        onDragEnter={!LOCKED ? (e) => { e.preventDefault(); dragDepthRef.current += 1; setDragOver(dragKey); } : undefined}
                        onDragOver={!LOCKED ? (e) => { e.preventDefault(); setDragOver(dragKey); } : undefined}
                        onDragLeave={!LOCKED ? () => { dragDepthRef.current -= 1; if (dragDepthRef.current <= 0) { dragDepthRef.current = 0; setDragOver(null); } } : undefined}
                        onDrop={!LOCKED ? (e) => handleCellDrop(e, openSlotFurniture.id, cellKey) : undefined}
                        onClick={() => {
                          if (editModalTarget?.furnitureId === openSlotFurniture.id && editModalTarget?.cellKey === cellKey) {
                            setEditModalTarget(null);
                          } else {
                            setEditModalTarget({ furnitureId: openSlotFurniture.id, cellKey });
                          }
                        }}
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* CellModal */}
      {!LOCKED && editModalTarget && editModalFurniture && editModalCell !== null && (
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
