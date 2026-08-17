/** Фоновое обновление очереди unshipped с Casher API */
export const ORDERS_API_POLL_MS = 20_000;

/** Повторный pull после отправки — Casher успевает убрать заказ из unshipped */
export const ORDERS_API_REFRESH_AFTER_SHIP_MS = 2_000;
