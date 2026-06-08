export interface ProductSize {
  id: number;
  size: string;
  quantity: number;
  isVisible: boolean;
}

export interface ApiProduct {
  id: string;
  name: string;
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
}

export type OrderUrgency = "critical" | "high" | "normal" | "low";

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
  customerName: string;
  urgency: OrderUrgency;
  deadline: string;
  items: ShippingOrderItem[];
  barcodePrinted: boolean;
  barcodePrintedAt?: number;
}

export type ShippingTab = "assembly" | "shipping";
