"use client";

import { useEffect } from "react";

function touchDistance(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function touchMidY(touches: TouchList): number {
  return (touches[0].clientY + touches[1].clientY) / 2;
}

function findScrollParent(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el instanceof HTMLElement) {
      const { overflowY } = getComputedStyle(el);
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        el.scrollHeight > el.clientHeight + 1
      ) {
        return el;
      }
      if (el.classList.contains("otpravki-shell")) break;
    }
    el = el.parentElement;
  }

  const main = document.querySelector(".otpravki-shell main");
  return main instanceof HTMLElement ? main : null;
}

/**
 * Складской тач: без горизонтальных/лишних жестов.
 * Прокрутка страницы — только двумя пальцами вверх/вниз.
 * Pinch блокируется.
 */
export function useOtpravkiNoSwipe() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("otpravki-noswipe");
    body.classList.add("otpravki-noswipe");

    let startMidY: number | null = null;
    let startDist: number | null = null;
    let mode: "none" | "scroll" | "pinch" = "none";
    let scrollEl: HTMLElement | null = null;

    const reset = () => {
      startMidY = null;
      startDist = null;
      mode = "none";
      scrollEl = null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        reset();
        return;
      }
      startMidY = touchMidY(event.touches);
      startDist = touchDistance(event.touches);
      mode = "none";
      scrollEl = findScrollParent(event.target);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || startMidY == null || startDist == null) {
        if (event.touches.length > 1) event.preventDefault();
        return;
      }

      const midY = touchMidY(event.touches);
      const dist = touchDistance(event.touches);
      const dy = midY - startMidY;
      const dDist = dist - startDist;

      if (mode === "none") {
        if (Math.abs(dDist) > 28 && Math.abs(dDist) > Math.abs(dy)) {
          mode = "pinch";
        } else if (Math.abs(dy) > 10) {
          mode = "scroll";
        }
      }

      if (mode === "pinch") {
        event.preventDefault();
        return;
      }

      if (mode === "scroll") {
        event.preventDefault();
        const target = scrollEl ?? findScrollParent(event.target);
        if (target) {
          // Пальцы вниз → контент вниз (scrollTop уменьшается)
          target.scrollTop -= dy;
          startMidY = midY;
          startDist = dist;
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) reset();
    };

    const onGestureStart = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("gesturestart", onGestureStart, { passive: false });

    return () => {
      html.classList.remove("otpravki-noswipe");
      body.classList.remove("otpravki-noswipe");
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      document.removeEventListener("gesturestart", onGestureStart);
    };
  }, []);
}
