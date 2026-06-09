const HEALTH_URL = "/api/health";
const PING_TIMEOUT_MS = 2_000;
const REACHABILITY_INTERVAL_MS = 3_000;

export async function checkServerReachable(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function subscribeServerReachability(
  onChange: (reachable: boolean) => void,
): () => void {
  let reachable = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const probe = async () => {
    if (closed) return;
    const next = await checkServerReachable();
    if (next !== reachable) {
      reachable = next;
      onChange(next);
    }
  };

  void (async () => {
    const initial = await checkServerReachable();
    if (closed) return;
    reachable = initial;
    onChange(initial);
    timer = setInterval(() => void probe(), REACHABILITY_INTERVAL_MS);
  })();

  const onVisible = () => {
    if (document.visibilityState === "visible") void probe();
  };

  window.addEventListener("online", probe);
  window.addEventListener("focus", probe);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    closed = true;
    if (timer) clearInterval(timer);
    window.removeEventListener("online", probe);
    window.removeEventListener("focus", probe);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
