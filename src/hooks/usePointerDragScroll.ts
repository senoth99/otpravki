"use client";

/**
 * Раньше: drag-scroll для мониторов с эмуляцией мыши.
 * На планшетах (/sborka и др.) он глотал click (pointer capture + suppressClick).
 * Скролл оставляем нативный (overflow + touch-action). Хук — no-op.
 */
export function usePointerDragScroll() {
  // намеренно пусто
}
