/** Заказ для блогеров — номер начинается с «б» */
export function isBloggerOrder(orderNumber: string): boolean {
  const first = orderNumber.trim()[0];
  return first === "б" || first === "Б";
}

export function orderIsBlogger(order: { orderNumber: string; isBlogger?: boolean }): boolean {
  return order.isBlogger ?? isBloggerOrder(order.orderNumber);
}
