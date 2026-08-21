import { NextResponse } from "next/server";
import {
  getPrinterDiagnostics,
  printToBarcodePrinter,
} from "@/lib/server/barcode-printer";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { requireUserSession } from "@/lib/server/auth-session";
import { markOrderShipped, resolveRemoteOrderIdForStatusApi } from "@/lib/server/orders-api";
import { recordShipmentEvent } from "@/lib/server/shift-stats-store";
import { getSharedWorkspace, persistAndReplaceArchive } from "@/lib/server/workspace-store";
import type { ShippingOrder } from "@/types/shipping";

export const maxDuration = 60;

export async function GET() {
  const info = await getPrinterDiagnostics();
  return NextResponse.json({
    ok: Boolean(info.printer),
    printer: info.printer,
    defaultPrinter: info.defaultPrinter,
    printers: info.printers,
    auto: !process.env.BARCODE_PRINTER?.trim(),
    hint: info.hint,
  });
}

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      orderNumber?: string;
      orderId?: string;
      barcodeData?: string;
      barcodeUrl?: string;
      order?: ShippingOrder;
      stage?: "brand" | "track" | "both";
      skipShip?: boolean;
    };

    if (!body.orderNumber) {
      return NextResponse.json(
        { ok: false, reason: "invalid_payload", message: "Некорректные данные заказа" },
        { status: 400 },
      );
    }

    if (!body.orderId?.trim()) {
      return NextResponse.json(
        { ok: false, reason: "missing_order_id", message: "Нет ID заказа для смены статуса в Casher" },
        { status: 400 },
      );
    }

    const stage = body.stage ?? "both";
    const result = await printToBarcodePrinter(body.orderNumber, {
      orderId: body.orderId,
      barcodeUrl: body.barcodeUrl,
      barcodeData: body.barcodeData,
      brand: body.order?.storeBrand,
      order: body.order,
      trackingNumber: body.order?.trackingNumber,
      stage,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: "print_failed",
          message: result.error ?? "Не удалось напечатать",
          printer: result.printer ?? null,
        },
        { status: 500 },
      );
    }

    const shouldShip = !body.skipShip && stage !== "brand";
    if (shouldShip) {
      try {
        await markOrderShipped(
          resolveRemoteOrderIdForStatusApi(
            body.orderId.trim(),
            body.order?.remoteOrderId,
          ),
          body.order?.storeBrand,
        );
      } catch (error) {
        return NextResponse.json(
          {
            ok: false,
            reason: "status_update_failed",
            message:
              error instanceof Error
                ? error.message
                : "Баркод напечатан, но не удалось отметить заказ отправленным в Casher",
            printed: true,
          },
          { status: 502 },
        );
      }

      const workspace = await getSharedWorkspace();
      const orderId = body.orderId.trim();
      const fromSession =
        body.order ??
        workspace?.orders.find((order) => order.id === orderId) ??
        workspace?.shippedArchive?.find((order) => order.id === orderId);

      if (fromSession) {
        const archived: ShippingOrder = {
          ...fromSession,
          barcodePrinted: true,
          barcodePrintedAt: fromSession.barcodePrintedAt ?? Date.now(),
        };

        try {
          const userCtx = await requireUserSession({ touch: true });
          if (userCtx) {
            archived.shippedByUserId = userCtx.user.id;
            archived.shippedByEmoji = userCtx.user.emoji;
            await recordShipmentEvent({
              ts: archived.barcodePrintedAt ?? Date.now(),
              userId: userCtx.user.id,
              orderId: archived.id,
              orderNumber: archived.orderNumber,
            });
          }
        } catch {
          // статистика не должна ломать печать
        }

        await persistAndReplaceArchive([archived]);
      }
    }

    return NextResponse.json({
      ok: true,
      method: "server",
      printer: result.printer,
      format: result.format,
      stage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "print_error",
        message: error instanceof Error ? error.message : "Ошибка печати",
      },
      { status: 500 },
    );
  }
}
