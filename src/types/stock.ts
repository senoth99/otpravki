export interface ApiStockSizeEntry {
  id: number;
  size: string;
  quantity: number;
}

export interface ApiStockItem {
  productSlug: string;
  productName: string;
  brand: string;
  imageUrl: string;
  sizes: ApiStockSizeEntry[];
  totalQuantity: number;
}

export interface WarehouseCell {
  id: string; // "rack-{row}-{col}" или "table-{row}-{col}"
  zone: "rack" | "table";
  row: number;
  col: number;
  productSlug?: string;
  productName?: string;
  brand?: string;
  sizes?: string[]; // ["S", "M", "L", "XL"]
  label?: string;
}

export interface WarehouseMapConfig {
  cells: WarehouseCell[];
  updatedAt: number;
}
