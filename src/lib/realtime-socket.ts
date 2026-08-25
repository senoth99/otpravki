import { io, type Socket } from "socket.io-client";

const SOCKET_RECONNECT_MS = 300;

let shared: Socket | null = null;
let refs = 0;
let queryKey = "";

function queryString(query?: Record<string, string>): string {
  if (!query) return "";
  return Object.keys(query)
    .sort()
    .map((key) => `${key}=${query[key] ?? ""}`)
    .join("&");
}

/** Один websocket на вкладку: сборка больше не открывает второй сокет. */
export function acquireRealtimeSocket(query?: Record<string, string>): Socket {
  const nextKey = queryString(query);
  if (shared && refs === 0 && queryKey !== nextKey) {
    shared.disconnect();
    shared = null;
    queryKey = "";
  }

  if (!shared) {
    const apiSecret = process.env.NEXT_PUBLIC_OTPRAVKI_API_SECRET?.trim();
    shared = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: SOCKET_RECONNECT_MS,
      reconnectionAttempts: Infinity,
      auth: apiSecret ? { secret: apiSecret } : undefined,
      query,
    });
    queryKey = nextKey;
  }

  refs += 1;
  return shared;
}

export function releaseRealtimeSocket(): void {
  refs = Math.max(0, refs - 1);
  if (refs > 0 || !shared) return;
  shared.disconnect();
  shared = null;
  queryKey = "";
}
