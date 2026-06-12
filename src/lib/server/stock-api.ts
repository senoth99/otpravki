import type { ApiStockItem, ApiStockSizeEntry } from "@/types/stock";
import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import { ORDERS_API_BASE, casherAuthHeaders, getCasherApiKey } from "@/lib/server/casher-api";
import { externalFetch } from "@/lib/server/external-fetch";

const STOCK_URL = "https://api.cashercollection.com/warehouses/2/stock";

// ---------------------------------------------------------------------------
// Raw API shapes (union of known formats)
// ---------------------------------------------------------------------------

interface RawGroupedItem {
  productSlug: string;
  productName?: string;
  name?: string;
  brand?: string;
  image?: string;
  imageUrl?: string;
  images?: string[];
  sizes: Array<{
    id?: number;
    size: string;
    quantity: number;
  }>;
}

interface RawFlatItem {
  productSlug: string;
  productName?: string;
  name?: string;
  brand?: string;
  image?: string;
  imageUrl?: string;
  images?: string[];
  size: string;
  quantity: number;
  id?: number;
}

type RawItem = RawGroupedItem | RawFlatItem;

function isGrouped(item: RawItem): item is RawGroupedItem {
  return Array.isArray((item as RawGroupedItem).sizes);
}

function extractImageUrl(item: Pick<RawGroupedItem, "image" | "imageUrl" | "images">): string {
  if (item.imageUrl) return item.imageUrl;
  if (item.image) return item.image;
  if (Array.isArray(item.images) && item.images.length > 0) return item.images[0];
  return "";
}

function normalizeGrouped(raw: RawGroupedItem): ApiStockItem {
  const sizes: ApiStockSizeEntry[] = raw.sizes.map((s, idx) => ({
    id: s.id ?? idx,
    size: s.size,
    quantity: s.quantity,
  }));

  const totalQuantity = sizes.reduce((sum, s) => sum + (s.quantity > 0 ? s.quantity : 0), 0);

  return {
    productSlug: raw.productSlug,
    productName: raw.productName ?? raw.name ?? raw.productSlug,
    brand: raw.brand ?? "",
    imageUrl: extractImageUrl(raw),
    sizes,
    totalQuantity,
  };
}

function normalizeFlatList(items: RawFlatItem[]): ApiStockItem[] {
  // Group by productSlug + brand
  const map = new Map<string, ApiStockItem>();

  for (const item of items) {
    const key = `${item.productSlug}__${item.brand ?? ""}`;
    if (!map.has(key)) {
      map.set(key, {
        productSlug: item.productSlug,
        productName: item.productName ?? item.name ?? item.productSlug,
        brand: item.brand ?? "",
        imageUrl: extractImageUrl(item),
        sizes: [],
        totalQuantity: 0,
      });
    }

    const entry = map.get(key)!;
    const sizeEntry: ApiStockSizeEntry = {
      id: item.id ?? entry.sizes.length,
      size: item.size,
      quantity: item.quantity,
    };
    entry.sizes.push(sizeEntry);
    if (item.quantity > 0) {
      entry.totalQuantity += item.quantity;
    }
  }

  return Array.from(map.values());
}

function normalizeResponse(raw: unknown): ApiStockItem[] {
  if (!Array.isArray(raw)) return [];

  if (raw.length === 0) return [];

  const first = raw[0] as RawItem;

  if (isGrouped(first)) {
    return (raw as RawGroupedItem[]).map(normalizeGrouped);
  }

  return normalizeFlatList(raw as RawFlatItem[]);
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export async function fetchWarehouseStock(): Promise<ApiStockItem[]> {
  const key = getCasherApiKey();
  if (!key) {
    throw new Error("Не задан API-ключ (CASHER_API_KEY в .env)");
  }

  let res: Response;
  try {
    res = await externalFetch(STOCK_URL, {
      headers: {
        ...casherAuthHeaders(),
        Accept: "application/json",
      },
      timeoutMs: 20_000,
    });
  } catch (error) {
    throw new Error(formatApiFetchError(error, STOCK_URL));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        "Неверный API-ключ (401). Проверь CASHER_API_KEY в .env и перезапусти: sudo systemctl restart otpravki",
      );
    }
    throw new Error(`API склада: ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }

  const json = await res.json();
  return normalizeResponse(json);
}
