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
  productSlug?: string;
  productName?: string;
  brand?: string;
  sizes?: string[];   // ["S", "M", "L"]
  label?: string;
}

export interface FurnitureItem {
  id: string;
  type: "rack" | "table";
  label: string;
  x: number;          // позиция на холсте (px)
  y: number;
  rows: number;       // количество рядов
  cols: number;       // количество колонок
  cells: Record<string, WarehouseCell>;  // ключ: "r{row}c{col}", например "r1c3"
  rotation?: "h" | "v";  // h = горизонтально (по умолчанию), v = вертикально
}

export interface WarehouseMapConfig {
  furniture: FurnitureItem[];
  updatedAt: number;
}
