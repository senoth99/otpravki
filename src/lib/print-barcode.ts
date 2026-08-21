export interface PrintResult {
  ok: boolean;
  message?: string;
  printer?: string | null;
}

import type { ShippingOrder } from "@/types/shipping";

export type PrintStage = "brand" | "track" | "both";

export interface PrintOrderOptions {
  orderId?: string;
  barcodeUrl?: string;
  barcodeData?: string;
  order?: ShippingOrder;
  /** brand — только макет; track — трек + отметка отправки; both — всё сразу */
  stage?: PrintStage;
  /** Не менять статус в Casher (например после brand-этапа) */
  skipShip?: boolean;
}

/** Серверная печать на баркод-принтер через CUPS */
export async function printOrderBarcode(
  orderNumber: string,
  options: PrintOrderOptions = {},
): Promise<PrintResult> {
  try {
    const { mutatingApiHeaders } = await import("@/lib/api-headers");
    const res = await fetch("/api/print", {
      method: "POST",
      headers: mutatingApiHeaders(),
      body: JSON.stringify({
        orderNumber,
        orderId: options.orderId,
        barcodeUrl: options.barcodeUrl,
        barcodeData: options.barcodeUrl ? undefined : (options.barcodeData ?? orderNumber),
        order: options.order,
        stage: options.stage ?? "both",
        skipShip: options.skipShip ?? options.stage === "brand",
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      printer?: string | null;
    };

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        message:
          data.message ??
          (res.status === 500
            ? "Ошибка печати на сервере"
            : "Принтер не ответил — проверь USB и CUPS на сервере"),
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
