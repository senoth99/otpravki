/** TSC TE300 / OtpravkiLabel — TSPL raw; SATO и прочие только через CUPS. */
const TSC_TSPL_PRINTER_RE = /tsc|te300|otpravkilabel/i;
const SATO_PRINTER_RE = /ws408|sato|sepl/i;

export function isSatoPrinter(printer: string): boolean {
  return SATO_PRINTER_RE.test(printer.trim());
}

/** Основная очередь SATO (не дубль -2). */
export function preferredSatoQueueName(printers: string[]): string | null {
  const sato = printers.filter((name) => isSatoPrinter(name) && !/-2$/i.test(name));
  if (sato.length === 0) {
    const any = printers.find((name) => isSatoPrinter(name));
    return any ?? null;
  }
  const exact = sato.find((name) => /^WS408-SEPL$/i.test(name));
  return exact ?? sato[0];
}

/** Очереди, куда можно слать TSPL (и прямой USB TSC). */
export function isTscTsplPrinter(printer: string): boolean {
  const name = printer.trim();
  if (!name) return false;
  if (isSatoPrinter(name)) return false;
  return TSC_TSPL_PRINTER_RE.test(name);
}
