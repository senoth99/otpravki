"use client";

import { useCallback, useRef, type RefObject, type TouchEvent } from "react";

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
 * Горизонтальный свайп пальцем для сенсорного монитора.
 * Не мешает вертикальному скроллу и не трогает multi-touch (pinch блокируется отдельно).
 */
export function useHorizontalSwipe<T extends HTMLElement = HTMLElement>({
  onSwipeLeft,
  onSwipeRight,
  threshold = 64,
  axisLockRatio = 1.2,
  enabled = true,
}: UseHorizontalSwipeOptions): {
  ref: RefObject<T | null>;
  handlers: {
    onTouchStart: (event: TouchEvent<T>) => void;
    onTouchEnd: (event: TouchEvent<T>) => void;
    onTouchCancel: () => void;
  };
} {
  const ref = useRef<T | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = useCallback(
    (event: TouchEvent<T>) => {
      if (!enabled) return;
      if (event.touches.length !== 1) {
        startRef.current = null;
        return;
      }
      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    },
    [enabled],
  );

  const onTouchCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent<T>) => {
      if (!enabled) {
        startRef.current = null;
        return;
      }
      const start = startRef.current;
      startRef.current = null;
      if (!start || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const elapsed = Date.now() - start.t;

      if (elapsed > 800) return;
      if (absX < threshold) return;
      if (absX < absY * axisLockRatio) return;

      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    [axisLockRatio, enabled, onSwipeLeft, onSwipeRight, threshold],
  );

  return {
    ref,
    handlers: { onTouchStart, onTouchEnd, onTouchCancel },
  };
}
