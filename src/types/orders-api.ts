export interface ApiStaffComment {
  id: number;
  body: string;
  createdAt: string;
  authorName: string;
  parentId: number | null;
  source: string;
}

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
  customerComment?: string | null;
  staffComments?: ApiStaffComment[] | null;
  tags?: Array<{ label: string; color?: string }> | null;
  items: ApiOrderLineItem[];
  hasAnyInStock: boolean;
  allInStockAtWarehouse: boolean;
  barcodeUrl: string;
}

export interface ApiQueueDelay {
  enabled: boolean;
  hours: number;
}

/** Ответ GET /orders/admin/unshipped-with-stock */
export interface ApiUnshippedOrdersResponse {
  queueDelay?: ApiQueueDelay;
  orders: ApiUnshippedOrder[];
}

export function parseUnshippedOrdersPayload(data: unknown): ApiUnshippedOrder[] {
  if (Array.isArray(data)) return data as ApiUnshippedOrder[];
  if (data && typeof data === "object" && Array.isArray((data as ApiUnshippedOrdersResponse).orders)) {
    return (data as ApiUnshippedOrdersResponse).orders;
  }
  throw new Error("API заказов: неожиданный формат ответа");
}
