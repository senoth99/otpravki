/** Очередь / приёмка производства (Amarix). */

export interface ProductionFacility {
  id: number;
  name: string;
  is_default: boolean;
}

export interface ProductionQueueItem {
  product_id: number;
  product_name: string;
  product_slug?: string | null;
  brand_code?: string;
  storeBrand: string;
  chestny_znak: string | null;
  size: string;
  /** Сколько нужно пошить (в facility-API — quantity_to_produce, в admin — quantity). */
  quantity_to_produce: number;
  batch_size: number;
  stock: number;
  threshold: number;
  on_demand: boolean;
  link_only: boolean;
}

export interface ProductionReceiveLine {
  product_id: number;
  size: string;
  quantity: number;
  warehouse_slug?: string;
}

export interface ProductionReceiveLineResult {
  product_id: number;
  size: string;
  received_quantity: number;
  stock: number;
  /** Сколько ещё осталось пошить по позиции после прихода. */
  quantity: number;
  warehouse_slug?: string;
  warehouse_id?: number;
  product_name?: string;
}

export interface ProductionReceiveResult {
  ok: boolean;
  queue_count?: number;
  lines: ProductionReceiveLineResult[];
  warehouse_slug?: string;
  warehouse_id?: number;
}

export interface ProductionProductSize {
  size_id: number;
  size: string;
  chestny_znak?: string | null;
  stock: number;
  stock_available?: number;
  reserved?: number;
  threshold?: number;
  batch_size?: number;
  visible?: boolean;
}

export interface ProductionCatalogProduct {
  product_id: number;
  product_name: string;
  product_slug: string | null;
  brand_code: string;
  category?: string | null;
  price?: number;
  images: string[];
  on_demand?: boolean;
  soldout?: boolean;
  sizes: ProductionProductSize[];
}
