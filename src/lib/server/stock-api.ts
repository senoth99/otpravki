import type { ApiStockItem, ApiStockSizeEntry } from "@/types/stock";
import { formatApiFetchError } from "@/lib/server/api-fetch-error";
import { ORDERS_API_BASE, casherAuthHeaders, getCasherApiKey } from "@/lib/server/casher-api";
import { externalFetch } from "@/lib/server/external-fetch";
import { getImageUrl } from "@/lib/image-url";

const STOCK_URL = `${ORDERS_API_BASE}/warehouses/2/stock`;

interface RawStockEntry {
  quantity: number;
  productSizeId: number;
  productSize: {
    id: number;
    size: string;
    productId: number;
    product: {
      id: number;
      name: string;
      slug: string;
      brand?: string;
      images: string[];
    };
  };
}

function normalizeResponse(raw: unknown): ApiStockItem[] {
  if (!Array.isArray(raw)) {
    throw new Error("Некорректный ответ API склада: ожидался массив");
  }
  if (raw.length === 0) return [];

  const map = new Map<number, ApiStockItem>();

  for (const entry of raw as RawStockEntry[]) {
    const ps = entry?.productSize;
    if (!ps?.product) continue;

    const productId = ps.product.id;

    if (!map.has(productId)) {
      map.set(productId, {
        productSlug: ps.product.slug,
        productName: ps.product.name,
        brand: ps.product.brand ?? "",
        imageUrl: ps.product.images?.[0] ? getImageUrl(ps.product.images[0]) : "",
        sizes: [],
        totalQuantity: 0,
      });
    }

    const item = map.get(productId)!;
    const sizeEntry: ApiStockSizeEntry = {
      id: ps.id,
      size: ps.size,
      quantity: entry.quantity ?? 0,
    };
    item.sizes.push(sizeEntry);
    if (sizeEntry.quantity > 0) {
      item.totalQuantity += sizeEntry.quantity;
    }
  }

  return Array.from(map.values());
}

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
