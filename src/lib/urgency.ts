import { moscowDateKey } from "@/lib/format";
import type { OrderUrgency, ShippingOrder } from "@/types/shipping";

/** Меньше = выше в очереди */
export const URGENCY_WEIGHT: Record<OrderUrgency, number> = {
  critical: 0,
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

export const URGENCY_LABELS: Record<OrderUrgency, { label: string; className: string }> = {
  critical: { label: "Критический", className: "bg-red-100 text-red-800" },
  urgent: { label: "Срочно", className: "bg-orange-100 text-orange-800" },
  high: { label: "Высокий", className: "bg-amber-100 text-amber-800" },
  normal: { label: "Обычный", className: "bg-blue-100 text-blue-700" },
  low: { label: "Обычный", className: "bg-gray-100 text-gray-600" },
};

/** Календарный возраст заказа в днях (Москва). */
export function moscowAgeDays(createdAt: string, now: number | Date = Date.now()): number {
  const created = moscowDateKey(createdAt);
  const today = moscowDateKey(now);
  const [cy, cm, cd] = created.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const start = Date.UTC(cy, cm - 1, cd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

/**
 * Срочность по возрасту неотправленного заказа:
 * - более 7 дней → critical (Критический)
 * - больше 5 дней → urgent (Срочно)
 * - 3 дня и больше → high (Высокий)
 * - иначе → normal (Обычный)
 */
export function deriveUrgency(createdAt: string, now: number | Date = Date.now()): OrderUrgency {
  const ageDays = moscowAgeDays(createdAt, now);
  if (ageDays > 7) return "critical";
  if (ageDays > 5) return "urgent";
  if (ageDays >= 3) return "high";
  return "normal";
}

export function resolveOrderUrgency(
  order: Pick<ShippingOrder, "urgency" | "createdAt">,
  now: number | Date = Date.now(),
): OrderUrgency {
  if (order.createdAt) return deriveUrgency(order.createdAt, now);
  return order.urgency;
}
