export type ArchiveDeliveryStatus = "in-transit" | "delivered";

export const ARCHIVE_STATUS_LABEL: Record<ArchiveDeliveryStatus, string> = {
  "in-transit": "В обработке",
  delivered: "Уехал",
};

export const ARCHIVE_STATUS_HINT: Record<ArchiveDeliveryStatus, string> = {
  "in-transit": "Заказ ещё не уехал в СДЭК или СДЭК его ещё не отправил",
  delivered: "Заказ уехал к покупателю — всё",
};

export function getArchiveDeliveryStatus(
  orderId: string,
  apiOrderIds: ReadonlySet<string>,
): ArchiveDeliveryStatus {
  return apiOrderIds.has(orderId) ? "in-transit" : "delivered";
}

export function canUnshipFromArchive(
  orderId: string,
  apiOrderIds: ReadonlySet<string>,
): boolean {
  return getArchiveDeliveryStatus(orderId, apiOrderIds) === "in-transit";
}
