export interface CasherErrorView {
  title: string;
  hint: string;
}

export function describeCasherLoadError(error: unknown): CasherErrorView {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("401") || message.includes("Неверный API-ключ")) {
    return {
      title: "Неверный API-ключ Casher",
      hint: `${message}. Обнови CASHER_API_KEY в ~/otpravki/.env и перезапусти: sudo systemctl restart otpravki`,
    };
  }

  if (message.includes("Не задан API-ключ")) {
    return {
      title: "Не задан API-ключ",
      hint: "Добавь CASHER_API_KEY=csh_at_... в ~/otpravki/.env и выполни: sudo systemctl restart otpravki",
    };
  }

  if (
    message.includes("Товары недоступны") ||
    message.includes("не может подключиться") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("fetch failed") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT")
  ) {
    return {
      title: "Нет связи с Casher API",
      hint: `${message}. Проверь на сервере: curl -s http://127.0.0.1:3000/api/health/casher`,
    };
  }

  if (message.startsWith("API заказов:")) {
    return {
      title: "Casher API: ошибка заказов",
      hint: `${message}. Проверь: curl -s http://127.0.0.1:3000/api/health/casher`,
    };
  }

  return {
    title: "Не удалось загрузить заказы",
    hint: `${message}. Проверь: curl -s http://127.0.0.1:3000/api/health/casher`,
  };
}
