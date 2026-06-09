export function formatApiFetchError(error: unknown, url?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const host = (() => {
    if (!url) return "api.cashercollection.com";
    try {
      return new URL(url).hostname;
    } catch {
      return "api.cashercollection.com";
    }
  })();

  if (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.includes("UND_ERR") ||
    message.includes("aborted")
  ) {
    return `Сервер не может подключиться к ${host}. Проверь интернет и DNS на Debian: curl -I https://${host}/products`;
  }

  return message;
}
