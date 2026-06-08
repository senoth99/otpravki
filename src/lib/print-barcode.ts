/** Только серверная печать — принтер ищется автоматически через CUPS */
export async function printOrderBarcode(
  orderNumber: string,
  barcodeData: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber, barcodeData }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}
