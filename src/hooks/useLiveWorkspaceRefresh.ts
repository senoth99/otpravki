"use client";

import { useCallback, useEffect, useRef } from "react";
import { ORDERS_API_POLL_MS } from "@/lib/orders-sync";
import { refreshWorkspaceFromApi, subscribeWorkspaceStream } from "@/lib/workspace";
import type { SharedWorkspaceState } from "@/types/workspace";

interface UseLiveWorkspaceRefreshOptions {
  enabled?: boolean;
}

/**
 * Тянет Casher unshipped: сразу при открытии, по интервалу, при возврате на вкладку
 * и по пользовательским действиям не чаще чем раз в ORDERS_API_POLL_MS.
 */
export function useLiveWorkspaceRefresh(
  apply: (workspace: SharedWorkspaceState) => void,
  options?: UseLiveWorkspaceRefreshOptions,
) {
  const enabled = options?.enabled ?? true;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const lastAtRef = useRef(0);
  const inFlightRef = useRef(false);

  const refresh = useCallback(
    async (force = false) => {
      if (!enabled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (!force && now - lastAtRef.current < ORDERS_API_POLL_MS) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      lastAtRef.current = now;
      try {
        const result = await refreshWorkspaceFromApi();
        if (result.ok && result.workspace) applyRef.current(result.workspace);
      } finally {
        inFlightRef.current = false;
      }
    },
    [enabled],
  );

  const onUserAction = useCallback(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    void refresh(true);

    const timer = window.setInterval(() => {
      void refresh(false);
    }, ORDERS_API_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    const unsubscribe = subscribeWorkspaceStream({
      onSync: (workspace) => applyRef.current(workspace),
      onWorkspace: (workspace) => applyRef.current(workspace),
    });

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [enabled, refresh]);

  return { onUserAction };
}
