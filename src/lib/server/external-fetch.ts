import { setDefaultResultOrder } from "node:dns";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

const DEFAULT_TIMEOUT_MS = 20_000;

setDefaultResultOrder("ipv4first");

/** Node fetch иногда висит на IPv6 — на сервере форсируем IPv4 */
const ipv4Agent = new Agent({
  connect: { family: 4 },
});

export async function externalFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { timeoutMs: _timeout, ...rest } = init ?? {};

  return undiciFetch(url, {
    ...rest,
    dispatcher: ipv4Agent,
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  } as UndiciRequestInit) as unknown as Promise<Response>;
}

export async function probeExternalApi(
  url = "https://api.amarix.ru/products",
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
