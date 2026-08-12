import type {
  ApiProduct,
  AssemblyItem,
  ShippingOrder,
  ShippingOrderItem,
} from "@/types/shipping";

/** Баркод «партия-артикул» → код после разделителя (например 5iuw8-1445 → 1445) */
export function parseBarcodeArticleCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const spaced = trimmed.split(/\s+-\s+/);
  if (spaced.length >= 2) {
    return spaced.slice(1).join("-").trim();
  }

  const dash = trimmed.lastIndexOf("-");
  if (dash >= 0) {
    return trimmed.slice(dash + 1).trim();
  }

  return trimmed;
}

/** @deprecated Используй parseBarcodeArticleCode; оставлено для slug-фолбэка */
export function parseBarcodeProductKey(raw: string): string {
  const article = parseBarcodeArticleCode(raw);
  if (/^\d+$/.test(article)) return article;
  return article.trim().toLowerCase().replace(/\s+/g, "-");
}

function itemMatchesArticle(item: ShippingOrderItem, articleCode: string): boolean {
  const code = articleCode.trim();
  if (!code) return false;
  return String(item.sizeId) === code || item.barcodeId === code;
}

export function findProductByBarcodeKey(
  products: ApiProduct[],
  key: string,
): ApiProduct | null {
  const k = key.trim().toLowerCase().replace(/\s+/g, "-");
  if (!k) return null;

  const exact = products.find((p) => p.slug.toLowerCase() === k);
  if (exact) return exact;

  const suffixMatches = products.filter(
    (p) => p.slug.toLowerCase() === k || p.slug.toLowerCase().endsWith(`-${k}`),
  );
  if (suffixMatches.length === 1) return suffixMatches[0];

  if (suffixMatches.length > 1) {
    const endsWith = suffixMatches.filter((p) => p.slug.toLowerCase().endsWith(`-${k}`));
    if (endsWith.length === 1) return endsWith[0];
    return null;
  }

  const contains = products.filter((p) => p.slug.toLowerCase().includes(k));
  if (contains.length === 1) return contains[0];

  return null;
}

export type OrderItemMatchResult =
  | { ok: true; item: ShippingOrderItem }
  | { ok: false; reason: "not-in-order" | "already-scanned" | "ambiguous" };

export function findScannableOrderItemByArticle(
  order: ShippingOrder,
  articleCode: string,
): OrderItemMatchResult {
  const pending = order.items.filter(
    (item) => itemMatchesArticle(item, articleCode) && item.scannedCount < item.quantity,
  );

  if (pending.length === 1) {
    return { ok: true, item: pending[0] };
  }

  if (pending.length > 1) {
    return { ok: false, reason: "ambiguous" };
  }

  const inOrder = order.items.some((item) => itemMatchesArticle(item, articleCode));
  if (inOrder) {
    return { ok: false, reason: "already-scanned" };
  }

  return { ok: false, reason: "not-in-order" };
}

export function findScannableOrderItem(
  order: ShippingOrder,
  productSlug: string,
): OrderItemMatchResult {
  const slug = productSlug.toLowerCase();
  const pending = order.items.filter(
    (item) => item.productId.toLowerCase() === slug && item.scannedCount < item.quantity,
  );

  if (pending.length === 1) {
    return { ok: true, item: pending[0] };
  }

  if (pending.length > 1) {
    return { ok: false, reason: "ambiguous" };
  }

  const inOrder = order.items.some((item) => item.productId.toLowerCase() === slug);
  if (inOrder) {
    return { ok: false, reason: "already-scanned" };
  }

  return { ok: false, reason: "not-in-order" };
}

function productFromItem(item: ShippingOrderItem, products: ApiProduct[]): ApiProduct {
  return (
    products.find((p) => p.slug === item.productId) ?? {
      id: item.productId,
      slug: item.productId,
      name: item.productName,
      images: item.imageUrl ? [item.imageUrl] : [],
      brand: item.brand,
      sizes: [{ id: item.sizeId, size: item.size, quantity: 0, isVisible: true }],
      inStock: true,
      isDeleted: false,
    }
  );
}

function findProductBySizeId(products: ApiProduct[], sizeId: string): ApiProduct | null {
  for (const product of products) {
    if (product.sizes.some((size) => String(size.id) === sizeId)) {
      return product;
    }
  }
  return null;
}

function assemblyItemMatchesArticle(item: AssemblyItem, articleCode: string): boolean {
  const code = articleCode.trim();
  if (!code) return false;
  return String(item.sizeId) === code || item.barcodeId === code;
}

/** Сопоставление штрихкода с позицией сборки (по sizeId / barcodeId). */
export function resolveAssemblyScan(
  items: AssemblyItem[],
  rawCode: string,
  options?: { onlyItemId?: string },
): { ok: true; item: AssemblyItem } | { ok: false; message: string } {
  const articleCode = parseBarcodeArticleCode(rawCode);
  if (!articleCode) {
    return { ok: false, message: "Пустой штрихкод" };
  }

  const candidates = items.filter((item) => assemblyItemMatchesArticle(item, articleCode));
  if (candidates.length === 0) {
    return { ok: false, message: `Артикул ${articleCode} нет в сборке` };
  }

  if (options?.onlyItemId) {
    const current = candidates.find((item) => item.id === options.onlyItemId);
    if (!current) {
      return { ok: false, message: `Отсканируйте текущую позицию маршрута` };
    }
    if (current.collectedCount >= current.quantity) {
      return { ok: false, message: `${current.productName} — уже собрано` };
    }
    return { ok: true, item: current };
  }

  const pending = candidates.filter((item) => item.collectedCount < item.quantity);
  if (pending.length === 1) {
    return { ok: true, item: pending[0] };
  }
  if (pending.length > 1) {
    return {
      ok: false,
      message: `Артикул ${articleCode} — несколько позиций, отметь вручную`,
    };
  }

  const name = candidates[0]?.productName ?? `артикул ${articleCode}`;
  return { ok: false, message: `${name} — уже собрано` };
}

export function resolveScanFromBarcode(
  products: ApiProduct[],
  order: ShippingOrder,
  rawCode: string,
):
  | { ok: true; item: ShippingOrderItem; product: ApiProduct }
  | { ok: false; message: string } {
  const articleCode = parseBarcodeArticleCode(rawCode);
  if (!articleCode) {
    return { ok: false, message: "Пустой штрихкод" };
  }

  const byArticle = findScannableOrderItemByArticle(order, articleCode);
  if (byArticle.ok) {
    return {
      ok: true,
      item: byArticle.item,
      product: productFromItem(byArticle.item, products),
    };
  }

  if (byArticle.reason === "already-scanned") {
    const item = order.items.find((line) => itemMatchesArticle(line, articleCode));
    const name = item?.productName ?? `артикул ${articleCode}`;
    return { ok: false, message: `${name} — уже отсканировано` };
  }

  if (byArticle.reason === "ambiguous") {
    return { ok: false, message: `Артикул ${articleCode} — несколько позиций, отметь вручную` };
  }

  const catalogProduct = /^\d+$/.test(articleCode)
    ? findProductBySizeId(products, articleCode)
    : findProductByBarcodeKey(products, parseBarcodeProductKey(rawCode));

  if (catalogProduct) {
    return { ok: false, message: `${catalogProduct.name} — нет в этом заказе` };
  }

  if (/^\d+$/.test(articleCode)) {
    return { ok: false, message: `Артикул ${articleCode} не найден` };
  }

  return { ok: false, message: `Товар «${articleCode}» не найден в каталоге` };
}
