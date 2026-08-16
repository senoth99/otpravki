"use client";

import { useEffect } from "react";

/** Только анти-pinch в Safari. Однопальцевый скролл не трогаем. */
export function useOtpravkiNoSwipe() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("otpravki-noswipe");
    body.classList.add("otpravki-noswipe");

    const blockGesture = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });

    return () => {
      html.classList.remove("otpravki-noswipe");
      body.classList.remove("otpravki-noswipe");
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
    };
  }, []);
}
