export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 20_000;
  const { timeoutMs: _timeout, signal: outerSignal, ...rest } = init ?? {};

  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return fetch(input, {
      ...rest,
      signal: outerSignal ?? AbortSignal.timeout(timeoutMs),
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (outerSignal) {
    if (outerSignal.aborted) {
      controller.abort();
    } else {
      outerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  return fetch(input, { ...rest, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}
