"use client";

import { useEffect } from "react";

type GestureMode = "tablet" | "monitor";

/**
 * tablet — /sborka: pinch off, touch-action manipulation (тапы на планшете).
 * monitor — /otpravki: pinch off, вертикальный pan (свайп на сенсорном мониторе).
 */
export function useOtpravkiNoSwipe(mode: GestureMode = "tablet") {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const cls = mode === "monitor" ? "otpravki-monitor" : "otpravki-noswipe";
    html.classList.add(cls);
    body.classList.add(cls);

    const blockGesture = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });

    return () => {
      html.classList.remove(cls);
      body.classList.remove(cls);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
    };
  }, [mode]);
}
