"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type {
  ApiStockItem,
  FurnitureItem,
  WarehouseCell,
  WarehouseMapConfig,
} from "@/types/stock";
import { toLocalImageUrl } from "@/lib/image-url";
import { CellModal } from "./CellModal";

interface WarehouseMapProps {
  initialMap: WarehouseMapConfig;
  stock: ApiStockItem[];
  readOnly?: boolean;
  navigateTarget?: { furnitureId: string; cellKey: string };
}

const SLOT_W = 72;
const SLOT_H = 60;
const SNAP_THRESHOLD = 12;
const RACK_ROWS = 4;
const POPOVER_W = 210;
const RACK_LABEL_H = 28;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;

function inferColsFromCells(cells: Record<string, WarehouseCell>): number {
  let maxCol = 1;
  for (const key of Object.keys(cells)) {
    const m = key.match(/^r\d+c(\d+)$/);
    if (m) maxCol = Math.max(maxCol, parseInt(m[1], 10));
  }
  return maxCol;
}

function normalizeFurnitureItem(f: FurnitureItem): FurnitureItem {
  const rawCells =
    f.cells && typeof f.cells === "object" && !Array.isArray(f.cells) ? f.cells : {};
  const cells: Record<string, WarehouseCell> = {};
  for (const [key, cell] of Object.entries(rawCells)) {
    const m = key.match(/^r(\d+)c(\d+)$/);
    if (f.type === "rack" && m && parseInt(m[1], 10) > RACK_ROWS) continue;
    cells[key] = cell;
  }
  const cols = Math.max(1, Number(f.cols) || inferColsFromCells(cells));
  const rows = f.type === "rack" ? RACK_ROWS : Math.max(1, Number(f.rows) || RACK_ROWS);
  return {
    ...f,
    x: Number(f.x) || 0,
    y: Number(f.y) || 0,
    cols,
    rows,
    cells,
    rotation: f.rotation === "v" ? "v" : "h",
  };
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
  const labelH = f.label?.trim() ? RACK_LABEL_H : 0;
  return body + 8 + labelH;
}

function buildStockIndex(stock: ApiStockItem[]): Map<string, ApiStockItem> {
  const index = new Map<string, ApiStockItem>();
  for (const item of stock) {
    index.set(item.productSlug, item);
    index.set(item.productSlug.toLowerCase(), item);
  }
  return index;
}

function getColumnProductSlugs(f: FurnitureItem, colNum: number): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (let r = 1; r <= f.rows; r++) {
    const slug = f.cells[`r${r}c${colNum}`]?.productSlug;
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }
  return slugs;
}

function cellSearchHaystack(
  cell: WarehouseCell | undefined,
  stockBySlug: Map<string, ApiStockItem>,
): string {
  if (!cell) return "";
  const stock =
    cell.productSlug
      ? (stockBySlug.get(cell.productSlug) ?? stockBySlug.get(cell.productSlug.toLowerCase()))
      : undefined;
  return [
    cell.productName,
    cell.productSlug,
    cell.brand,
    cell.label,
    ...(cell.sizes ?? []),
    stock?.productName,
    stock?.brand,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function cellMatchesSearch(
  cell: WarehouseCell | undefined,
  query: string,
  stockBySlug: Map<string, ApiStockItem>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return cellSearchHaystack(cell, stockBySlug).includes(q);
}

function columnMatchesSearch(
  f: FurnitureItem,
  colNum: number,
  query: string,
  stockBySlug: Map<string, ApiStockItem>,
): boolean {
  const q = query.trim();
  if (!q) return true;
  for (let r = 1; r <= f.rows; r++) {
    if (cellMatchesSearch(f.cells[`r${r}c${colNum}`], q, stockBySlug)) return true;
  }
  return false;
}

function ProductIcon({ imageUrl, alt, size }: { imageUrl: string; alt: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const src = toLocalImageUrl(imageUrl);

  if (!src || failed) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded bg-gray-200"
        style={{ width: size, height: size }}
        title={alt}
      >
        <span className="text-[7px] text-gray-400">?</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className="shrink-0 rounded object-cover bg-white ring-1 ring-white/80"
      onError={() => setFailed(true)}
    />
  );
}

function MapProductIcons({
  slugs,
  stockBySlug,
  maxSize = 22,
}: {
  slugs: string[];
  stockBySlug: Map<string, ApiStockItem>;
  maxSize?: number;
}) {
  if (slugs.length === 0) return null;

  const iconSize =
    slugs.length === 1 ? Math.min(maxSize * 1.6, 40) : slugs.length <= 4 ? maxSize : Math.max(14, maxSize - 4);

  return (
    <div className="flex h-full w-full flex-wrap items-center justify-center gap-0.5 p-1">
      {slugs.map((slug) => {
        const item = stockBySlug.get(slug) ?? stockBySlug.get(slug.toLowerCase());
        return (
          <ProductIcon
            key={slug}
            imageUrl={item?.imageUrl ?? ""}
            alt={item?.productName ?? slug}
            size={iconSize}
          />
        );
      })}
    </div>
  );
}

function getSlotWorldCenter(f: FurnitureItem, col: number): { x: number; y: number } {
  const isV = f.rotation === "v";
  const slotCount = Math.max(1, Number(f.cols) || 1);
  const fWidth = getFurnitureWidth(f);
  const colIdx = isV ? slotCount - col : col - 1;
  const pad = 8;
  const labelH = f.label?.trim() ? RACK_LABEL_H : 0;
  if (isV) {
    return {
      x: f.x + pad + (fWidth - 16) / 2,
      y: f.y + labelH + pad + colIdx * (SLOT_H + 4) + SLOT_H / 2,
    };
  }
  return {
    x: f.x + pad + colIdx * (SLOT_W + 4) + SLOT_W / 2,
    y: f.y + labelH + pad + SLOT_H / 2,
  };
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

export function WarehouseMap({
  initialMap,
  stock,
  readOnly = false,
  navigateTarget,
}: WarehouseMapProps) {
  const [furniture, setFurniture] = useState<FurnitureItem[]>(() =>
    autoAlign((initialMap.furniture ?? []).map(normalizeFurnitureItem)),
  );
  const [editModalTarget, setEditModalTarget] = useState<{ furnitureId: string; cellKey: string } | null>(null);
  const [openSlot, setOpenSlot] = useState<{ furnitureId: string; col: number } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const viewportRef = useRef<HTMLDivElement>(null);
  const slotAnchorRef = useRef<HTMLElement | null>(null);
  const dragDepthRef = useRef(0);
  const baseScaleRef = useRef(1);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const panSessionRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  baseScaleRef.current = baseScale;
  zoomRef.current = zoom;
  panRef.current = pan;

  const effectiveScale = baseScale * zoom;

  const centerView = useCallback((scale: number, zoomLevel: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const contentW = canvasSizeRef.current.w * scale * zoomLevel;
    const contentH = canvasSizeRef.current.h * scale * zoomLevel;
    setPan({
      x: (viewport.clientWidth - contentW) / 2,
      y: (viewport.clientHeight - contentH) / 2,
    });
  }, []);

  const canvasSize = computeCanvasSize(furniture);
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  const stockBySlug = useMemo(() => buildStockIndex(stock), [stock]);
  const searchActive = searchQuery.trim().length > 0;

  const matchCount = useMemo(() => {
    if (!searchActive) return 0;
    let count = 0;
    for (const f of furniture) {
      for (let col = 1; col <= f.cols; col++) {
        for (let r = 1; r <= f.rows; r++) {
          if (cellMatchesSearch(f.cells[`r${r}c${col}`], searchQuery, stockBySlug)) count++;
        }
      }
    }
    return count;
  }, [furniture, searchQuery, searchActive, stockBySlug]);

  const zoomAtPoint = useCallback((clientX: number, clientY: number, factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const anchorX = clientX - rect.left;
    const anchorY = clientY - rect.top;

    const oldScale = baseScaleRef.current * zoomRef.current;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor));
    const newScale = baseScaleRef.current * nextZoom;

    const worldX = (anchorX - panRef.current.x) / oldScale;
    const worldY = (anchorY - panRef.current.y) / oldScale;

    setZoom(nextZoom);
    setPan({
      x: anchorX - worldX * newScale,
      y: anchorY - worldY * newScale,
    });
  }, []);

  const focusNavigateTarget = useCallback(() => {
    if (!navigateTarget || !viewportRef.current) return false;
    const f = furniture.find((item) => item.id === navigateTarget.furnitureId);
    if (!f) return false;
    const match = navigateTarget.cellKey.match(/^r(\d+)c(\d+)$/);
    if (!match) return false;
    const col = parseInt(match[2], 10);
    const center = getSlotWorldCenter(f, col);
    const vw = viewportRef.current.clientWidth;
    const vh = viewportRef.current.clientHeight;
    const targetZoom = vw < 380 ? 1.2 : vw < 640 ? 1.45 : 1.7;
    setZoom(targetZoom);
    const scale = baseScaleRef.current * targetZoom;
    const panelH = readOnly ? 112 : 0;
    setPan({
      x: vw / 2 - center.x * scale,
      y: (vh - panelH) / 2 - center.y * scale,
    });
    return true;
  }, [navigateTarget, furniture, readOnly]);

  const resetView = useCallback(() => {
    if (navigateTarget && focusNavigateTarget()) return;
    setZoom(1);
    centerView(baseScaleRef.current, 1);
  }, [centerView, navigateTarget, focusNavigateTarget]);

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

  useEffect(() => {
    if (!navigateTarget) return;
    const match = navigateTarget.cellKey.match(/^r(\d+)c(\d+)$/);
    if (!match) return;
    setOpenSlot({ furnitureId: navigateTarget.furnitureId, col: parseInt(match[2], 10) });
  }, [navigateTarget]);

  useLayoutEffect(() => {
    if (readOnly || !openSlot) return;
    if (!slotAnchorRef.current && viewportRef.current) {
      const el = viewportRef.current.querySelector(
        `[data-map-slot][data-furniture-id="${openSlot.furnitureId}"][data-col="${openSlot.col}"]`,
      ) as HTMLElement | null;
      if (el) slotAnchorRef.current = el;
    }
    updatePopoverPos();
    window.addEventListener("resize", updatePopoverPos);
    return () => window.removeEventListener("resize", updatePopoverPos);
  }, [openSlot, updatePopoverPos, pan, zoom, baseScale, readOnly]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateBaseScale = () => {
      const pad = 16;
      const vw = viewport.clientWidth - pad;
      const vh = viewport.clientHeight - pad;
      if (vw <= 0 || vh <= 0) return;
      const nextBase = Math.max(0.12, Math.min(vw / canvasSize.w, vh / canvasSize.h, 1));
      setBaseScale(nextBase);
      if (navigateTarget) {
        requestAnimationFrame(() => focusNavigateTarget());
      } else {
        centerView(nextBase, zoomRef.current);
      }
    };

    updateBaseScale();
    const ro = new ResizeObserver(updateBaseScale);
    ro.observe(viewport);
    window.addEventListener("resize", updateBaseScale);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateBaseScale);
    };
  }, [canvasSize.w, canvasSize.h, centerView, navigateTarget, focusNavigateTarget]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomAtPoint(e.clientX, e.clientY, factor);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAtPoint]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-map-slot]")) return;

    panSessionRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session) return;
    setPan({
      x: session.panX + e.clientX - session.startX,
      y: session.panY + e.clientY - session.startY,
    });
  }, []);

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panSessionRef.current) return;
    panSessionRef.current = null;
    setIsPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
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

  function zoomFromToolbar(factor: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  const editModalFurniture = editModalTarget ? furniture.find((f) => f.id === editModalTarget.furnitureId) : null;
  const editModalCell = editModalFurniture ? (editModalFurniture.cells[editModalTarget!.cellKey] ?? {}) : null;
  const openSlotFurniture = openSlot ? furniture.find((f) => f.id === openSlot.furnitureId) : null;
  const navigateCol = navigateTarget?.cellKey.match(/^r(\d+)c(\d+)$/)?.[2];
  const navigateRow = navigateTarget?.cellKey.match(/^r(\d+)c(\d+)$/)?.[1];
  const navTargetCell =
    readOnly && navigateTarget && openSlotFurniture
      ? openSlotFurniture.cells[navigateTarget.cellKey]
      : undefined;

  return (
    <div className={`flex flex-col ${readOnly ? "gap-2 sm:gap-3" : "gap-4"}`}>
      <div className="flex flex-col gap-2">
        {!readOnly && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск товара на карте..."
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-20 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400"
            />
            {searchActive && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                {matchCount > 0 ? `${matchCount} яч.` : "нет"}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-1 py-1 shadow-sm">
          <button
            type="button"
            onClick={() => zoomFromToolbar(0.8)}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            aria-label="Уменьшить"
          >
            −
          </button>
          <span className="min-w-[3.5rem] text-center text-xs font-medium text-gray-600">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomFromToolbar(1.25)}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            aria-label="Увеличить"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            Сброс
          </button>
        </div>
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={handleSaveMap}
              className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Сохранить карту
            </button>
            {saved && <span className="text-xs text-green-600 font-medium">Сохранено!</span>}
          </>
        )}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 touch-none select-none ${
          isPanning ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          height: readOnly
            ? "min(52dvh, 520px)"
            : "min(calc(100dvh - 220px), 560px)",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: canvasSize.w,
            height: canvasSize.h,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${effectiveScale})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {furniture.map((f) => {
            const isV = f.rotation === "v";
            const fWidth = getFurnitureWidth(f);
            const slotCount = Math.max(1, Number(f.cols) || 1);

            const isNavRack = navigateTarget?.furnitureId === f.id;
            const isDimmedRack = Boolean(navigateTarget && !isNavRack);

            return (
              <div
                key={f.id}
                style={{ position: "absolute", left: f.x, top: f.y, zIndex: isNavRack ? 10 : 2 }}
                className={`overflow-hidden rounded-xl border bg-white shadow-md transition-opacity duration-200 ${
                  isNavRack
                    ? "border-amber-300 ring-2 ring-amber-200"
                    : "border-gray-200"
                } ${isDimmedRack ? "opacity-20 saturate-50" : "opacity-100"}`}
              >
                {f.label?.trim() && (
                  <div
                    className={`flex items-center justify-center gap-1.5 border-b px-2 py-1.5 sm:px-3 ${
                      isNavRack
                        ? "border-amber-200 bg-gradient-to-b from-amber-50 to-white"
                        : "border-gray-100 bg-gradient-to-b from-slate-50 to-white"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        isNavRack ? "bg-amber-400" : "bg-blue-400"
                      }`}
                    />
                    <span
                      className={`truncate text-[10px] font-semibold uppercase tracking-wider sm:text-[11px] ${
                        isNavRack ? "text-amber-900" : "text-gray-700"
                      }`}
                    >
                      {f.label.trim()}
                    </span>
                  </div>
                )}
                <div className={`p-2 ${isV ? "flex flex-col gap-1" : "flex flex-row gap-1"}`}>
                  {Array.from({ length: slotCount }, (_, colIdx) => {
                    const colNum = isV ? slotCount - colIdx : colIdx + 1;
                    let filledCount = 0;
                    for (let r = 1; r <= f.rows; r++) {
                      if (f.cells[`r${r}c${colNum}`]?.productSlug) filledCount++;
                    }
                    const hasAny = filledCount > 0;
                    const isOpen = openSlot?.furnitureId === f.id && openSlot?.col === colNum;
                    const productSlugs = getColumnProductSlugs(f, colNum);
                    const colMatches = columnMatchesSearch(f, colNum, searchQuery, stockBySlug);
                    const dimmed = searchActive && !colMatches;
                    const isNavTarget =
                      navigateTarget?.furnitureId === f.id && navigateCol === String(colNum);

                    return (
                      <div
                        key={colIdx}
                        data-map-slot
                        data-furniture-id={f.id}
                        data-col={colNum}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (readOnly) return;
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
                        className={`flex flex-col items-center justify-center overflow-hidden rounded-lg border transition-all duration-150 select-none
                          ${readOnly ? "cursor-default" : "cursor-pointer"}
                          ${isOpen ? "ring-2 ring-blue-400 ring-offset-1" : ""}
                          ${isNavTarget ? "ring-4 ring-amber-400 ring-offset-2 z-20 shadow-lg" : ""}
                          ${searchActive && colMatches ? "ring-2 ring-amber-400 ring-offset-1 z-10" : ""}
                          ${dimmed ? "opacity-25 saturate-50" : "opacity-100"}
                          ${hasAny ? "bg-blue-50 border-blue-200 hover:shadow" : "border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
                      >
                        {hasAny ? (
                          <>
                            <span
                              style={{ position: "absolute", top: 2, right: 3, zIndex: 1 }}
                              className="rounded bg-white/90 px-0.5 text-[8px] font-semibold text-blue-600"
                            >
                              {filledCount}/{f.rows}
                            </span>
                            <MapProductIcons slugs={productSlugs} stockBySlug={stockBySlug} />
                          </>
                        ) : (
                          <span className="text-[10px] font-medium text-gray-400">Я{colNum}</span>
                        )}
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

        {readOnly && navigateTarget && openSlotFurniture && navigateCol && (
          <div className="absolute inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-3 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3">
            <p className="text-[11px] font-semibold text-gray-900 sm:text-xs">
              {openSlotFurniture.label?.trim() || "Стеллаж"} · Я{navigateCol} · Р{navigateRow}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500 sm:text-xs">
              {navTargetCell?.productName ?? "Возьмите товар с подсвеченного ряда"}
            </p>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {Array.from({ length: openSlotFurniture.rows }, (_, rowIdx) => {
                const rowNum = openSlotFurniture.rows - rowIdx;
                const cellKey = `r${rowNum}c${navigateCol}`;
                const cell = openSlotFurniture.cells[cellKey];
                const isTarget = navigateRow === String(rowNum);
                return (
                  <div
                    key={rowNum}
                    className={`flex min-w-[3.25rem] shrink-0 flex-col items-center rounded-lg border px-2 py-1.5 text-center ${
                      isTarget
                        ? "border-amber-400 bg-amber-50 ring-2 ring-amber-300"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <span className={`text-[10px] font-semibold ${isTarget ? "text-amber-900" : "text-gray-500"}`}>
                      Р{rowNum}
                    </span>
                    <span className="mt-0.5 text-[9px] text-gray-400">
                      {cell?.productSlug ? "●" : "○"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!readOnly && openSlot && openSlotFurniture && typeof document !== "undefined" && createPortal(
        <>
          {!readOnly && (
            <div
              className="fixed inset-0"
              style={{ zIndex: 9998 }}
              onClick={() => {
                setEditModalTarget(null);
                setOpenSlot(null);
              }}
            />
          )}
          <div
            style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left, width: POPOVER_W, zIndex: 9999 }}
            className="bg-white rounded-xl shadow-xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-800">Я{openSlot.col}</span>
              {!readOnly && (
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
              )}
            </div>
            <div className="flex flex-col gap-1.5 p-2 max-h-[min(420px,calc(100vh-80px))] overflow-y-auto">
              {Array.from({ length: openSlotFurniture.rows }, (_, rowIdx) => {
                const rowNum = openSlotFurniture.rows - rowIdx;
                const cellKey = `r${rowNum}c${openSlot.col}`;
                const cell = openSlotFurniture.cells[cellKey];
                const hasProduct = Boolean(cell?.productSlug);
                const isDragOverThis = dragOver === `${openSlotFurniture.id}:${cellKey}`;
                const dragKey = `${openSlotFurniture.id}:${cellKey}`;
                const rowMatches = cellMatchesSearch(cell, searchQuery, stockBySlug);
                const rowDimmed = searchActive && !rowMatches;
                const isNavRow =
                  navigateTarget?.furnitureId === openSlotFurniture.id &&
                  navigateRow === String(rowNum);

                return (
                  <div key={rowIdx} className={`flex items-center gap-1.5 transition-opacity duration-150 ${rowDimmed ? "opacity-25" : ""}`}>
                    <div className="w-6 shrink-0 text-center text-[10px] font-medium text-gray-400">Р{rowNum}</div>
                    <div style={{ flex: 1 }}>
                      <div
                        draggable={!readOnly && hasProduct}
                        onDragStart={!readOnly && hasProduct ? (e) => handleCellDragStart(e, openSlotFurniture.id, cellKey) : undefined}
                        onDragEnter={readOnly ? undefined : (e) => {
                          e.preventDefault();
                          dragDepthRef.current += 1;
                          setDragOver(dragKey);
                        }}
                        onDragOver={readOnly ? undefined : (e) => {
                          e.preventDefault();
                          setDragOver(dragKey);
                        }}
                        onDragLeave={readOnly ? undefined : () => {
                          dragDepthRef.current -= 1;
                          if (dragDepthRef.current <= 0) {
                            dragDepthRef.current = 0;
                            setDragOver(null);
                          }
                        }}
                        onDrop={readOnly ? undefined : (e) => handleCellDrop(e, openSlotFurniture.id, cellKey)}
                        onClick={readOnly ? undefined : () => openCellEditor(openSlotFurniture.id, cellKey)}
                        className={`flex flex-col justify-center gap-0.5 rounded-lg border p-2 transition-all w-full
                          ${readOnly ? "cursor-default" : "cursor-pointer"}
                          ${isNavRow ? "ring-2 ring-amber-400 ring-offset-1 bg-amber-50" : ""}
                          ${searchActive && rowMatches ? "ring-2 ring-amber-400 ring-offset-1" : ""}
                          ${isDragOverThis ? "border-2 border-blue-400 bg-blue-100"
                            : hasProduct ? "border-blue-200 bg-blue-50 hover:shadow-sm"
                            : "border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100"}`}
                        style={{ minHeight: 52 }}
                      >
                        {hasProduct && cell?.productSlug ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <ProductIcon
                              imageUrl={
                                stockBySlug.get(cell.productSlug)?.imageUrl ??
                                stockBySlug.get(cell.productSlug.toLowerCase())?.imageUrl ??
                                ""
                              }
                              alt={cell.productName ?? cell.productSlug}
                              size={28}
                            />
                            <div className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-[10px] font-medium leading-tight text-blue-900">
                                {cell.productName}
                              </span>
                              {cell.sizes && cell.sizes.length > 0 && (
                                <span className="text-[8px] leading-tight text-gray-500 truncate block">
                                  {cell.sizes.join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
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

      {!readOnly && editModalTarget && editModalFurniture && editModalCell !== null && (
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
