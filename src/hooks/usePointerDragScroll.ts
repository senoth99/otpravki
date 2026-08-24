"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MOVE_THRESHOLD_PX = 24;

function isScrollableY(el: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") {
    return false;
  }
  return el.scrollHeight > el.clientHeight + 1;
}

function findScrollParent(start: Element | null): HTMLElement | null {
  let el = start as HTMLElement | null;
  while (el && el !== document.documentElement) {
    if (isScrollableY(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function shouldSkipTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  // Кнопки/ссылки нельзя тащить в drag-scroll: на складских планшетах
  // pointerType=mouse, джиттер пальца → click глушится и UI «мёртвый».
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, summary, [role="button"], [contenteditable="true"], [data-no-drag-scroll]',
    ),
  );
}

function pathDisablesDragScroll(pathname: string | null): boolean {
  if (!pathname) return false;
  // Сборка с планшета: нативный скролл + тапы. Drag-scroll только ломает клики.
  return pathname === "/sborka" || pathname.startsWith("/sborka/");
}

/**
 * Скролл списков пальцем на складских мониторах, которые эмулируют мышь
 * (нет touch* — только pointer/mouse). На реальном touch и на /sborka не вмешиваемся.
 */
export function usePointerDragScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathDisablesDragScroll(pathname)) return;

    let session: {
      el: HTMLElement;
      pointerId: number;
      startY: number;
      startScrollTop: number;
      moved: boolean;
    } | null = null;

    const endSession = (moved: boolean, scrolledPx = 0) => {
      if (!session) return;
      session.el.classList.remove("is-drag-scrolling");
      try {
        session.el.releasePointerCapture(session.pointerId);
      } catch {
        /* ignore */
      }
      // Глушим click только после реального скролла.
      if (moved && Math.abs(scrolledPx) >= 8) {
        const suppressClick = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
        };
        document.addEventListener("click", suppressClick, { capture: true, once: true });
        window.setTimeout(() => {
          document.removeEventListener("click", suppressClick, true);
        }, 50);
      }
      session = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      // Реальный touch/pen — браузер сам скроллит
      if (event.pointerType !== "mouse") return;
      // Есть настоящий тачскрин — не перехватываем (планшеты часто шлют mouse+touch)
      if (navigator.maxTouchPoints > 0) return;
      if (shouldSkipTarget(event.target)) return;

      const el = findScrollParent(event.target as Element | null);
      if (!el) return;

      const target = event.target;
      if (
        target instanceof Element &&
        (target instanceof HTMLImageElement || target.closest("img"))
      ) {
        event.preventDefault();
      }

      session = {
        el,
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: el.scrollTop,
        moved: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;

      const dy = event.clientY - session.startY;
      if (!session.moved) {
        if (Math.abs(dy) < MOVE_THRESHOLD_PX) return;
        session.moved = true;
        session.el.classList.add("is-drag-scrolling");
        try {
          session.el.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }

      session.el.scrollTop = session.startScrollTop - dy;
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const scrolledPx = session.el.scrollTop - session.startScrollTop;
      endSession(session.moved, scrolledPx);
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: false });
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      if (session) endSession(false);
    };
  }, [pathname]);
}
