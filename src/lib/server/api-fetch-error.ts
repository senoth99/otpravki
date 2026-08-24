function resolveHost(url?: string): string {
  if (!url) return "api.amarix.ru";
  try {
    return new URL(url).hostname;
  } catch {
    return "api.amarix.ru";
  }
}

function isNetworkError(message: string): boolean {
  return (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.includes("UND_ERR") ||
    message.includes("aborted")
  );
}

export function formatApiFetchError(
  error: unknown,
  url?: string,
  context: "default" | "print" = "default",
): string {
  const message = error instanceof Error ? error.message : String(error);
  const host = resolveHost(url);

  if (!isNetworkError(message)) return message;

  if (context === "print") {
    return `Не удалось скачать этикетку: сервер не видит ${host}. Нужен интернет на Debian (не на телефоне). Проверь: curl -I https://${host}/products`;
  }

  return `Сервер не может подключиться к ${host}. Проверь интернет и DNS на Debian: curl -I https://${host}/products`;
}
