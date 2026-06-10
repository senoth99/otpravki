import { setDefaultResultOrder } from "node:dns";

const DEFAULT_TIMEOUT_MS = 20_000;

setDefaultResultOrder("ipv4first");

export async function externalFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _timeout, ...rest } = init ?? {};

  return fetch(url, {
    ...rest,
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

export async function probeExternalApi(
  url = "https://api.cashercollection.com/products",
  headers?: HeadersInit,
): Promise<{ ok: boolean; status?: number; error?: string; ms: number }> {
  const started = Date.now();
  try {
    const res = await externalFetch(url, { timeoutMs: 20_000, headers });
    return { ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
  }
}
