import type { AssemblyItem, ShippingOrder } from "@/types/shipping";

export interface WorkspaceState {
  version: 1;
  assemblyItems: AssemblyItem[];
  orders: ShippingOrder[];
  /** ID заказов из последнего ответа API (unshipped-with-stock) */
  apiOrderIds?: string[];
  updatedAt: number;
}

export interface SharedWorkspaceState extends WorkspaceState {
  revision: number;
  updatedBy?: string;
  /** Меняется при деплое в мок-режиме — клиент сбрасывает localStorage */
  resetToken?: string;
}
