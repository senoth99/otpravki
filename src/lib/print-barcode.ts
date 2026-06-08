export interface PrintResult {
  ok: boolean;
  message?: string;
  printer?: string | null;
}

export interface PrintOrderOptions {
  orderId?: string;
  barcodeUrl?: string;
  barcodeData?: string;
}

/** Серверная печать на баркод-принтер через CUPS */
export async function printOrderBarcode(
  orderNumber: string,
  options: PrintOrderOptions = {},
): Promise<PrintResult> {
  try {
    const res = await fetch("/api/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber,
        orderId: options.orderId,
        barcodeUrl: options.barcodeUrl,
        barcodeData: options.barcodeUrl ? undefined : (options.barcodeData ?? orderNumber),
      }),
    });

    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      printer?: string | null;
    };

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        message: data.message ?? "Принтер не ответил — проверь USB и CUPS на сервере",
        printer: data.printer,
      };
    }

    return { ok: true, printer: data.printer };
  } catch {
    return {
      ok: false,
      message: "Нет связи с сервером печати",
    };
  }
}
