import { NextResponse } from "next/server";
import { receiveProduction } from "@/lib/server/production-api";
import { logSync } from "@/lib/server/sync-log";

export const dynamic = "force-dynamic";

interface ReceiveBody {
  brand?: string;
  product_id?: number;
  size?: string;
  quantity?: number;
  lines?: Array<{ product_id: number; size: string; quantity: number }>;
}

export async function POST(request: Request) {
  let body: ReceiveBody;
  try {
    body = (await request.json()) as ReceiveBody;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const brand = body.brand?.trim();
  if (!brand) {
    return NextResponse.json({ error: "brand обязателен" }, { status: 400 });
  }

  const lines =
    Array.isArray(body.lines) && body.lines.length > 0
      ? body.lines
      : body.product_id != null && body.size && body.quantity != null
        ? [{ product_id: body.product_id, size: body.size, quantity: body.quantity }]
        : [];

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Нужны product_id, size, quantity или lines[]" },
      { status: 400 },
    );
  }

  for (const line of lines) {
    if (!Number.isFinite(line.product_id) || !line.size?.trim() || !(line.quantity > 0)) {
      return NextResponse.json(
        { error: "Каждая строка: product_id, size, quantity > 0" },
        { status: 400 },
      );
    }
  }

  try {
    const result = await receiveProduction(brand, lines);
    void logSync("production.receive.ok", {
      brand,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        size: l.size,
        quantity: l.quantity,
      })),
      received: result.lines.map((l) => l.received_quantity),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка прихода";
    void logSync("production.receive.fail", { brand, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
