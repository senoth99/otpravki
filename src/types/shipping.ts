export interface ProductSize {
  id: number;
  size: string;
  quantity: number;
  isVisible: boolean;
}

export interface ApiProduct {
  id: string;
  name: string;
  slug: string;
  images: string[];
  brand: string;
  sizes: ProductSize[];
  inStock: boolean;
  isDeleted: boolean;
}

export interface AssemblyItem {
  id: string;
  productId: string;
  productName: string;
  size: string;
  sizeId: number;
  brand: string;
  imageUrl: string;
  barcodeId: string;
  quantity: number;
  collectedCount: number;
  collectedAt?: number;
  /** Отдельный пул сборки для блогерских заказов */
  isBlogger?: boolean;
}

export type OrderUrgency = "critical" | "rush" | "urgent" | "high" | "normal" | "low";

export interface OrderTag {
  label: string;
  color?: string;
}

export interface StaffComment {
  id: number;
  body: string;
  createdAt: string;
  authorName: string;
  parentId: number | null;
  source: string;
}

export interface ShippingOrderItem {
  id: string;
  productId: string;
  productName: string;
  size: string;
  sizeId: number;
  brand: string;
  imageUrl: string;
  barcodeId: string;
  quantity: number;
  scannedCount: number;
  scannedAt?: number;
  /** GTIN / код ЧЗ из карточки товара; пусто — ЧЗ не нужен */
  chestnyZnak?: string | null;
}

export interface MissingOrderItem {
  productName: string;
  size: string;
  quantity: number;
  availableForThisOrder: number;
}

export interface ShippingOrder {
  id: string;
  remoteOrderId?: string;
  storeBrand?: string;
  orderNumber: string;
  /** Номер начинается с «б» — заказ для блогеров */
  isBlogger?: boolean;
  customerName: string;
  /** ISO-дата оформления заказа (из API) */
  createdAt?: string;
  urgency: OrderUrgency;
  deadline: string;
  items: ShippingOrderItem[];
  barcodeUrl?: string;
  barcodePrinted: boolean;
  barcodePrintedAt?: number;
  /** Кто напечатал / отправил заказ */
  shippedByUserId?: string;
  shippedByEmoji?: string;
  allInStockAtWarehouse?: boolean;
  /** false — заказ не готов к отправке, не хватает товара */
  ready?: boolean;
  /** Чего не хватает; заполняется только если ready=false */
  missingItems?: MissingOrderItem[];
  city?: string;
  trackingNumber?: string;
  customerComment?: string;
  staffComments?: StaffComment[];
  tags?: OrderTag[];
}

export type ShippingTab = "shipping" | "archive";
