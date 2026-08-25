/** TSC TE300 / OtpravkiLabel — TSPL raw; SATO и прочие только через CUPS. */
const TSC_TSPL_PRINTER_RE = /tsc|te300|otpravkilabel/i;
const SATO_PRINTER_RE = /ws408|sato|sepl/i;

export function isSatoPrinter(printer: string): boolean {
  return SATO_PRINTER_RE.test(printer.trim());
}

/** Очереди, куда можно слать TSPL (и прямой USB TSC). */
export function isTscTsplPrinter(printer: string): boolean {
  const name = printer.trim();
  if (!name) return false;
  if (isSatoPrinter(name)) return false;
  return TSC_TSPL_PRINTER_RE.test(name);
}
