export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** GTIN-14 (ведущие нули). */
export function toGtin14(raw: string): string {
  const digits = digitsOnly(raw);
  if (!digits) return "";
  return digits.padStart(14, "0").slice(-14);
}

export function gtinsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const left = toGtin14(a);
  const right = toGtin14(b);
  return Boolean(left && right && left === right);
}
