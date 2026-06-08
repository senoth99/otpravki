export function formatSize(size: string): string {
  return size.trim().toUpperCase();
}

export function formatOrderNumberShort(orderNumber: string): string {
  const digits = orderNumber.replace(/\D/g, "");
  const last4 = digits.slice(-4).padStart(4, "0");
  return `CSH-${last4}`;
}
