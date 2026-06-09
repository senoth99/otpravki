import type { ApiProduct, ShippingOrder, ShippingOrderItem } from "@/types/shipping";

/** Баркод: «партия - цвет артикул» → берём часть после разделителя */
export function parseBarcodeProductKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const spaced = trimmed.split(/\s+-\s+/);
  if (spaced.length >= 2) {
    return normalizeBarcodeKey(spaced.slice(1).join("-"));
  }

  const dash = trimmed.indexOf("-");
  if (dash >= 0) {
    return normalizeBarcodeKey(trimmed.slice(dash + 1));
  }

  return normalizeBarcodeKey(trimmed);
}

function normalizeBarcodeKey(value: string): string {
  return value.trim().toLowerCase();
}

export function findProductByBarcodeKey(
  products: ApiProduct[],
  key: string,
): ApiProduct | null {
  const k = normalizeBarcodeKey(key);
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

export function resolveScanFromBarcode(
  products: ApiProduct[],
  order: ShippingOrder,
  rawCode: string,
):
  | { ok: true; item: ShippingOrderItem; product: ApiProduct }
  | { ok: false; message: string } {
  const key = parseBarcodeProductKey(rawCode);
  if (!key) {
    return { ok: false, message: "Пустой штрихкод" };
  }

  const product = findProductByBarcodeKey(products, key);
  if (!product) {
    return { ok: false, message: `Товар «${key}» не найден в каталоге` };
  }

  const match = findScannableOrderItem(order, product.slug);
  if (!match.ok) {
    if (match.reason === "not-in-order") {
      return { ok: false, message: `${product.name} — нет в этом заказе` };
    }
    if (match.reason === "already-scanned") {
      return { ok: false, message: `${product.name} — уже отсканировано` };
    }
    return {
      ok: false,
      message: `${product.name} — несколько размеров, отметь вручную`,
    };
  }

  return { ok: true, item: match.item, product };
}
