import { SkladPanel } from "@/components/sklad";
import { fetchWarehouseStock } from "@/lib/server/stock-api";
import { getWarehouseMap } from "@/lib/server/warehouse-map-store";
import type { ApiStockItem, WarehouseMapConfig } from "@/types/stock";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Склад | CASHER Admin",
};

const EMPTY_MAP: WarehouseMapConfig = {
  furniture: [],
  updatedAt: 0,
};

export default async function SkladPage() {
  let stock: ApiStockItem[] = [];
  let stockError: string | undefined;
  let warehouseMap: WarehouseMapConfig = EMPTY_MAP;

  // Fetch stock
  try {
    stock = await fetchWarehouseStock();
  } catch (err) {
    stockError = err instanceof Error ? err.message : "Ошибка загрузки остатков";
    stock = [];
  }

  // Fetch warehouse map
  try {
    warehouseMap = await getWarehouseMap();
  } catch {
    warehouseMap = EMPTY_MAP;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 px-3 py-3 sm:p-6">
      <SkladPanel
        initialStock={stock}
        initialMap={warehouseMap}
        stockError={stockError}
      />
    </div>
  );
}
