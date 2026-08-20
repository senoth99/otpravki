/** Заглушка, если нет мокапа: чёрный вопросик на белом */
export const PRODUCT_PLACEHOLDER_SRC = "/no-mockup.svg";

/** Путь картинки с API → локальный URL на сервере otpravki */
export function toLocalImageUrl(path: string): string {
  if (!path) return "";

  if (path.startsWith("/api/images/")) return path;

  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const { hostname, pathname } = new URL(path);
      if (hostname === "amarix-media.storage.yandexcloud.net" && pathname.startsWith("/")) {
        return `/api/images/yc${pathname}`;
      }
      if (pathname.startsWith("/uploads/")) {
        return `/api/images${pathname}`;
      }
    } catch {
      return path;
    }
    return path;
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith("/uploads/")) {
    return `/api/images${normalized}`;
  }

  return path;
}

export function getImageUrl(path: string): string {
  return toLocalImageUrl(path);
}
