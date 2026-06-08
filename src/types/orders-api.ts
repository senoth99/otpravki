export interface ApiOrderLineItem {
  id: number;
  productName: string;
  productSlug: string;
  size: string;
  quantity: number;
  price: number;
  warehouseQuantity: number;
  inStockAtWarehouse: boolean;
}

export interface ApiUnshippedOrder {
  id: number;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  total: number;
  fullName: string;
  city: string;
  deliveryMethod: string;
  trackingNumber: string | null;
  items: ApiOrderLineItem[];
  hasAnyInStock: boolean;
  allInStockAtWarehouse: boolean;
  barcodeUrl: string;
}
