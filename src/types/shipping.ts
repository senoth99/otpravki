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

export type OrderUrgency = "critical" | "high" | "normal" | "low";

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
}

export interface ShippingOrder {
  id: string;
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
  allInStockAtWarehouse?: boolean;
  city?: string;
  trackingNumber?: string;
  customerComment?: string;
  staffComments?: StaffComment[];
}

export type ShippingTab = "assembly" | "shipping" | "archive";
