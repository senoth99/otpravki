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
const RACK_ROWS = 4;
const POPOVER_W = 210;
const MIN_USER_ZOOM = 0.5;
const MAX_USER_ZOOM = 3;

function normalizeRack(f: FurnitureItem): FurnitureItem {
  if (f.type !== "rack") return f;
  const cells: Record<string, WarehouseCell> = {};
  for (const [key, cell] of Object.entries(f.cells)) {
    const m = key.match(/^r(\d+)c(\d+)$/);
    if (m && parseInt(m[1], 10) <= RACK_ROWS) cells[key] = cell;
  }
  return { ...f, rows: RACK_ROWS, cells };
}

function autoAlign(items: FurnitureItem[]): FurnitureItem[] {
  if (items.length <= 1) return items;
  const res = items.map((f) => ({ ...f }));
  for (let i = 0; i < res.length; i++) {
    for (let j = i + 1; j < res.length; j++) {
      if (Math.abs(res[i].x - res[j].x) <= SNAP_THRESHOLD) {
        const v = Math.min(res[i].x, res[j].x);
        res[i].x = v;
        res[j].x = v;
      }
      if (Math.abs(res[i].y - res[j].y) <= SNAP_THRESHOLD) {
        const v = Math.min(res[i].y, res[j].y);
        res[i].y = v;
        res[j].y = v;
      }
    }
  }
  return res;
}

function getFurnitureWidth(f: FurnitureItem): number {
  const isV = f.rotation === "v";
  return isV ? SLOT_W + 16 : f.cols * (SLOT_W + 4) - 4 + 16;
}

function getFurnitureHeight(f: FurnitureItem): number {
  const isV = f.rotation === "v";
  const body = isV ? f.cols * (SLOT_H + 4) - 4 + 16 : SLOT_H + 16;
  return body + 8;
}

function computeCanvasSize(items: FurnitureItem[]): { w: number; h: number } {
  if (items.length === 0) return { w: 800, h: 500 };
  let maxX = 0;
  let maxY = 0;
  for (const f of items) {
    maxX = Math.max(maxX, f.x + getFurnitureWidth(f));
    maxY = Math.max(maxY, f.y + getFurnitureHeight(f));
  }
  return { w: maxX + 40, h: maxY + 40 };
}

export function WarehouseMap({ initialMap, stock }: WarehouseMapProps) {
  const [furniture, setFurniture] = useState<FurnitureItem[]>(() =>
    autoAlign(initialMap.furniture.map(normalizeRack)),
  );
  const [editModalTarget, setEditModalTarget] = useState<{ furnitureId: string; cellKey: string } | null>(null);
  const [openSlot, setOpenSlot] = useState<{ furnitureId: string; col: number } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const slotAnchorRef = useRef<HTMLElement | null>(null);
  const dragDepthRef = useRef(0);
  const scaleRef = useRef(1);
  const [fitScale, setFitScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const effectiveScale = fitScale * userZoom;
  scaleRef.current = effectiveScale;

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
    window.addEventListener("resize", updatePopoverPos);
    window.addEventListener("scroll", updatePopoverPos, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPos);
      window.removeEventListener("scroll", updatePopoverPos, true);
    };
  }, [openSlot, updatePopoverPos]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      setUserZoom((z) => Math.min(MAX_USER_ZOOM, Math.max(MIN_USER_ZOOM, z + delta)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function handleCellSave(furnitureId: string, cellKey: string, cell: WarehouseCell) {
    setFurniture((prev) => prev.map((f) => (f.id === furnitureId ? { ...f, cells: { ...f.cells, [cellKey]: cell } } : f)));
    setEditModalTarget(null);
  }

  function handleCellClear(furnitureId: string, cellKey: string) {
    setFurniture((prev) =>
      prev.map((f) => {
        if (f.id !== furnitureId) return f;
        const cells = { ...f.cells };
        delete cells[cellKey];
        return { ...f, cells };
      }),
    );
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
      const { furnitureId: srcId, cellKey: srcKey } = JSON.parse(e.dataTransfer.getData("text/plain")) as {
        furnitureId: string;
        cellKey: string;
      };
      if (srcId === targetFurnitureId && srcKey === targetCellKey) return;
      setFurniture((prev) => {
        const next = prev.map((f) => ({ ...f, cells: { ...f.cells } }));
        const src = next.find((f) => f.id === srcId);
        const tgt = next.find((f) => f.id === targetFurnitureId);
        if (!src || !tgt) return prev;
        const srcCell = src.cells[srcKey];
        if (!srcCell) return prev;
        const tgtCell = tgt.cells[targetCellKey];
        if (tgtCell) {
          src.cells[srcKey] = tgtCell;
          tgt.cells[targetCellKey] = srcCell;
        } else {
          tgt.cells[targetCellKey] = srcCell;
          delete src.cells[srcKey];
        }
        return next;
      });
    } catch {
      /* ignore */
    }
  }

  function openCellEditor(furnitureId: string, cellKey: string) {
    setOpenSlot(null);
    slotAnchorRef.current = null;
    setEditModalTarget({ furnitureId, cellKey });
  }

  const canvasSize = computeCanvasSize(furniture);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateScale = () => {
      const pad = 16;
      const vw = viewport.clientWidth - pad;
      const vh = viewport.clientHeight - pad;
      if (vw <= 0 || vh <= 0) return;
      const scale = Math.min(vw / canvasSize.w, vh / canvasSize.h, 1);
      setFitScale(Math.max(0.12, scale));
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(viewport);
    window.addEventListener("resize", updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [canvasSize.w, canvasSize.h]);

  const editModalFurniture = editModalTarget ? furniture.find((f) => f.id === editModalTarget.furnitureId) : null;
  const editModalCell = editModalFurniture ? (editModalFurniture.cells[editModalTarget!.cellKey] ?? {}) : null;
  const openSlotFurniture = openSlot ? furniture.find((f) => f.id === openSlot.furnitureId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-1 py-1 shadow-sm">
          <button
            type="button"
            onClick={() => setUserZoom((z) => Math.max(MIN_USER_ZOOM, z - 0.25))}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            aria-label="Уменьшить"
          >
            −
          </button>
          <span className="min-w-[3.5rem] text-center text-xs font-medium text-gray-600">
            {Math.round(userZoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setUserZoom((z) => Math.min(MAX_USER_ZOOM, z + 0.25))}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            aria-label="Увеличить"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setUserZoom(1)}
            className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            Сброс
          </button>
        </div>
        <button
          type="button"
          onClick={handleSaveMap}
          className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Сохранить карту
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">Сохранено!</span>}
      </div>

      <div
        ref={viewportRef}
        className={`rounded-2xl border border-gray-200 bg-gray-100 ${userZoom > 1 ? "overflow-auto" : "overflow-hidden"}`}
        style={{ height: "min(calc(100dvh - 220px), 560px)" }}
      >
        <div ref={canvasRef} className="flex h-full w-full items-center justify-center">
          <div
            style={{
              width: canvasSize.w * effectiveScale,
              height: canvasSize.h * effectiveScale,
              flexShrink: 0,
            }}
          >
            <div
              className="canvas-inner relative"
              style={{
                width: canvasSize.w,
                height: canvasSize.h,
                transform: `scale(${effectiveScale})`,
                transformOrigin: "top left",
              }}
            >
              {furniture.map((f) => {
                const isV = f.rotation === "v";
                const fWidth = getFurnitureWidth(f);
                const slotCount = f.cols;

                return (
                  <div
                    key={f.id}
                    style={{ position: "absolute", left: f.x, top: f.y, zIndex: 2 }}
                    className="rounded-xl border border-gray-200 bg-white shadow-md"
                  >
                    <div className={`p-2 ${isV ? "flex flex-col gap-1" : "flex flex-row gap-1"}`}>
                      {Array.from({ length: slotCount }, (_, colIdx) => {
                        const colNum = colIdx + 1;
                        let filledCount = 0;
                        for (let r = 1; r <= f.rows; r++) {
                          if (f.cells[`r${r}c${colNum}`]?.productSlug) filledCount++;
                        }
                        const hasAny = filledCount > 0;
                        const isOpen = openSlot?.furnitureId === f.id && openSlot?.col === colNum;

                        return (
                          <div
                            key={colIdx}
                            onClick={(e) => {
                              e.stopPropagation();
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
                              <span
                                style={{ position: "absolute", top: 3, right: 5 }}
                                className="text-[9px] font-semibold text-blue-500"
                              >
                                {filledCount}/{f.rows}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400 font-medium mt-auto mb-1">Я{colNum}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {furniture.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                  Карта склада пуста
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {openSlot && openSlotFurniture && typeof document !== "undefined" && createPortal(
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => {
              setEditModalTarget(null);
              setOpenSlot(null);
            }}
          />
          <div
            style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left, width: POPOVER_W, zIndex: 9999 }}
            className="bg-white rounded-xl shadow-xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-800">Я{openSlot.col}</span>
              <button
                type="button"
                onClick={() => {
                  setEditModalTarget(null);
                  setOpenSlot(null);
                }}
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
                        draggable={hasProduct}
                        onDragStart={hasProduct ? (e) => handleCellDragStart(e, openSlotFurniture.id, cellKey) : undefined}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          dragDepthRef.current += 1;
                          setDragOver(dragKey);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(dragKey);
                        }}
                        onDragLeave={() => {
                          dragDepthRef.current -= 1;
                          if (dragDepthRef.current <= 0) {
                            dragDepthRef.current = 0;
                            setDragOver(null);
                          }
                        }}
                        onDrop={(e) => handleCellDrop(e, openSlotFurniture.id, cellKey)}
                        onClick={() => openCellEditor(openSlotFurniture.id, cellKey)}
                        className={`flex flex-col justify-center gap-0.5 rounded-lg border p-2 cursor-pointer transition-all w-full
                          ${isDragOverThis ? "border-2 border-blue-400 bg-blue-100"
                            : hasProduct ? "border-blue-200 bg-blue-50 hover:shadow-sm"
                            : "border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100"}`}
                        style={{ minHeight: 52 }}
                      >
                        {hasProduct ? (
                          <>
                            <span className="line-clamp-2 text-[10px] font-medium leading-tight text-blue-900">
                              {cell!.productName}
                            </span>
                            {cell!.sizes && cell!.sizes.length > 0 && (
                              <span className="text-[8px] leading-tight text-gray-500 truncate">
                                {cell!.sizes.join(", ")}
                              </span>
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
        document.body,
      )}

      {editModalTarget && editModalFurniture && editModalCell !== null && (
        <CellModal
          furnitureId={editModalTarget.furnitureId}
          cellKey={editModalTarget.cellKey}
          cell={editModalCell}
          furnitureLabel=""
          stock={stock}
          onSave={handleCellSave}
          onClear={handleCellClear}
          onClose={() => setEditModalTarget(null)}
        />
      )}
    </div>
  );
}
