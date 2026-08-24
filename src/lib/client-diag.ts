const ACTION_KEY = "otpravki-last-action";
const ALIVE_KEY = "otpravki-last-alive";
const ERRORS_KEY = "otpravki-last-errors";
export const CLIENT_ERROR_EVENT = "otpravki-client-error";

export type ClientDiagSnapshot = {
  lastAction: string | null;
  lastActionAt: number | null;
  crashedDuring: string | null;
  savedErrors: string[];
};

function now() {
  return Date.now();
}

export function noteClientAction(action: string): void {
  try {
    localStorage.setItem(
      ACTION_KEY,
      JSON.stringify({ action, t: now(), href: window.location.href }),
    );
  } catch {
    // quota / private mode
  }
}

export function markClientAlive(): void {
  try {
    localStorage.setItem(ALIVE_KEY, String(now()));
  } catch {
    // ignore
  }
}

export function reportClientError(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    const prev = JSON.parse(localStorage.getItem(ERRORS_KEY) || "[]") as unknown;
    const list = Array.isArray(prev) ? prev.filter((row) => typeof row === "string") : [];
    list.unshift(`${new Date().toISOString()} ${trimmed}`);
    localStorage.setItem(ERRORS_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(CLIENT_ERROR_EVENT, { detail: trimmed }));
  } catch {
    // ignore
  }
}

export function readClientDiag(): ClientDiagSnapshot {
  try {
    const rawAction = localStorage.getItem(ACTION_KEY);
    const alive = Number(localStorage.getItem(ALIVE_KEY) || 0);
    const savedErrors = JSON.parse(localStorage.getItem(ERRORS_KEY) || "[]") as unknown;
    const action = rawAction ? (JSON.parse(rawAction) as { action?: string; t?: number }) : null;
    const lastAction = action?.action?.trim() || null;
    const lastActionAt = typeof action?.t === "number" ? action.t : null;
    const crashedDuring =
      lastAction &&
      lastActionAt &&
      lastActionAt > alive &&
      now() - lastActionAt < 5 * 60 * 1000
        ? lastAction
        : null;
    return {
      lastAction,
      lastActionAt,
      crashedDuring,
      savedErrors: Array.isArray(savedErrors)
        ? savedErrors.filter((row): row is string => typeof row === "string")
        : [],
    };
  } catch {
    return { lastAction: null, lastActionAt: null, crashedDuring: null, savedErrors: [] };
  }
}
