import type { OrderUrgency } from "@/types/shipping";

export const URGENCY_WEIGHT: Record<OrderUrgency, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};
