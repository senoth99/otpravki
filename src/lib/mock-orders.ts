import type { AssemblyItem, OrderUrgency, ShippingOrder, ShippingOrderItem } from "@/types/shipping";
import { URGENCY_WEIGHT } from "@/lib/urgency";

const URGENCIES: OrderUrgency[] = ["critical", "high", "normal", "low"];

const CUSTOMER_NAMES = [
  "Иванов Алексей",
  "Петрова Мария",
  "Сидоров Дмитрий",
  "Козлова Анна",
  "Новиков Сергей",
  "Морозова Елена",
  "Волков Артём",
  "Соколова Ольга",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function toOrderItem(item: AssemblyItem, quantity: number): ShippingOrderItem {
  return {
    id: `${item.productId}-${item.sizeId}`,
    productId: item.productId,
    productName: item.productName,
    size: item.size,
    sizeId: item.sizeId,
    brand: item.brand,
    imageUrl: item.imageUrl,
    barcodeId: item.barcodeId,
    quantity,
    scannedCount: 0,
  };
}

export function generateOrdersFromAssembly(assemblyItems: AssemblyItem[], count = 5): ShippingOrder[] {
  if (assemblyItems.length === 0) return [];

  const orders: ShippingOrder[] = [];

  for (let i = 0; i < count; i++) {
    const urgency = URGENCIES[i % URGENCIES.length];
    const itemCount = Math.min(1 + (i % 3), assemblyItems.length);
    const shuffled = [...assemblyItems].sort(() => Math.random() - 0.5).slice(0, itemCount);

    const items = shuffled.map((assemblyItem, idx) => {
      const maxQty = Math.min(assemblyItem.quantity, idx === 0 ? 2 : 1);
      const quantity = i === 0 && idx === 0 ? Math.min(2, assemblyItem.quantity) : maxQty;
      return toOrderItem(assemblyItem, Math.max(1, quantity));
    });

    orders.push({
      id: `order-${i + 1}`,
      orderNumber: `CSH-${370000000000 + Math.floor(Math.random() * 999999999)}`,
      customerName: randomFrom(CUSTOMER_NAMES),
      urgency,
      deadline:
        urgency === "critical"
          ? "Сегодня"
          : urgency === "high"
            ? daysFromNow(1)
            : daysFromNow(2 + i),
      items,
      barcodePrinted: false,
    });
  }

  return orders.sort((a, b) => URGENCY_WEIGHT[a.urgency] - URGENCY_WEIGHT[b.urgency]);
}
