"use client";

import { useCallback, useRef, type PointerEvent, type RefObject } from "react";

interface UseHorizontalSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Минимальный горизонтальный сдвиг, px */
  threshold?: number;
  /** Игнорировать, если вертикаль сильнее горизонтали */
  axisLockRatio?: number;
  enabled?: boolean;
}

/**
 * Горизонтальный свайп для сенсорного монитора.
 * Pointer Events — touch-экраны часто эмулируют мышь и не шлют touch*.
 */
export function useHorizontalSwipe<T extends HTMLElement = HTMLElement>({
  onSwipeLeft,
  onSwipeRight,
  threshold = 48,
  axisLockRatio = 1.15,
  enabled = true,
}: UseHorizontalSwipeOptions): {
  ref: RefObject<T | null>;
  handlers: {
    onPointerDown: (event: PointerEvent<T>) => void;
    onPointerUp: (event: PointerEvent<T>) => void;
    onPointerCancel: () => void;
  };
} {
  const ref = useRef<T | null>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    t: number;
    id: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<T>) => {
      if (!enabled) return;
      if (event.button !== 0) return;
      const target = event.target as Element | null;
      if (target?.closest?.("[data-no-swipe]")) {
        startRef.current = null;
        return;
      }

      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        t: Date.now(),
        id: event.pointerId,
      };

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [enabled],
  );

  const finish = useCallback(() => {
    startRef.current = null;
  }, []);

  const onPointerCancel = useCallback(() => {
    finish();
  }, [finish]);

  const onPointerUp = useCallback(
    (event: PointerEvent<T>) => {
      if (!enabled) {
        finish();
        return;
      }

      const start = startRef.current;
      startRef.current = null;
      if (!start || event.pointerId !== start.id) return;

      const target = event.target as Element | null;
      if (target?.closest?.("[data-no-swipe]")) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const elapsed = Date.now() - start.t;

      if (elapsed > 1000) return;
      if (absX < threshold) return;
      if (absX < absY * axisLockRatio) return;

      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    [axisLockRatio, enabled, finish, onSwipeLeft, onSwipeRight, threshold],
  );

  return {
    ref,
    handlers: { onPointerDown, onPointerUp, onPointerCancel },
  };
}
