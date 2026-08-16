"use client";

import { useEffect } from "react";

/** Блокирует pinch/zoom на складском таче; обычный скролл одним пальцем остаётся. */
export function useOtpravkiNoSwipe() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("otpravki-noswipe");
    body.classList.add("otpravki-noswipe");

    const blockPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };

    const blockGesture = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("touchmove", blockPinch, { passive: false });
    document.addEventListener("gesturestart", blockGesture, { passive: false });

    return () => {
      html.classList.remove("otpravki-noswipe");
      body.classList.remove("otpravki-noswipe");
      document.removeEventListener("touchmove", blockPinch);
      document.removeEventListener("gesturestart", blockGesture);
    };
  }, []);
}
