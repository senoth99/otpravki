"use client";

import { useEffect } from "react";

/** Блокирует pinch/multi-touch и overscroll-свайпы на страницах отправок/сборки. */
export function useOtpravkiNoSwipe() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("otpravki-noswipe");
    body.classList.add("otpravki-noswipe");

    const blockGesture = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    document.addEventListener("gesturestart", blockGesture as EventListener, { passive: false });
    document.addEventListener("touchmove", blockGesture, { passive: false });

    return () => {
      html.classList.remove("otpravki-noswipe");
      body.classList.remove("otpravki-noswipe");
      document.removeEventListener("gesturestart", blockGesture as EventListener);
      document.removeEventListener("touchmove", blockGesture);
    };
  }, []);
}
