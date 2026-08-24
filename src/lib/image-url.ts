/** Заглушка, если нет мокапа: чёрный вопросик на белом */
export const PRODUCT_PLACEHOLDER_SRC = "/no-mockup.svg";

const YANDEX_HOST = "amarix-media.storage.yandexcloud.net";

/**
 * uploads/products/{file} на api.* часто недоступен (502),
 * те же файлы лежат в Yandex: products/products/{file}.
 */
function yandexObjectFromUploadsPath(pathname: string): string | null {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const match = normalized.match(
    /^\/uploads\/products\/([^/?#]+\.(?:webp|jpe?g|png|gif|avif))$/i,
  );
  if (!match) return null;
  return `products/products/${match[1]}`;
}

/** Путь картинки с API → локальный URL на сервере otpravki */
export function toLocalImageUrl(path: string): string {
  if (!path) return "";

  if (path.startsWith("/api/images/")) {
    // Старые заказы: /api/images/uploads/products/UUID.webp → yc
    if (path.startsWith("/api/images/uploads/")) {
      const rest = path.slice("/api/images/".length);
      const yc = yandexObjectFromUploadsPath(rest);
      if (yc) return `/api/images/yc/${yc}`;
    }
    return path;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const { hostname, pathname } = new URL(path);
      if (hostname === YANDEX_HOST && pathname.startsWith("/")) {
        return `/api/images/yc${pathname}`;
      }
      const fromUploads = yandexObjectFromUploadsPath(pathname);
      if (fromUploads) {
        return `/api/images/yc/${fromUploads}`;
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
  const fromUploads = yandexObjectFromUploadsPath(normalized);
  if (fromUploads) {
    return `/api/images/yc/${fromUploads}`;
  }
  if (normalized.startsWith("/uploads/")) {
    return `/api/images${normalized}`;
  }
  // Уже относительный путь в бакете: products/products/...
  if (normalized.startsWith("/products/")) {
    return `/api/images/yc${normalized}`;
  }

  return path;
}

export function getImageUrl(path: string): string {
  return toLocalImageUrl(path);
}
