import { NextResponse } from "next/server";
import { formatMoscowIso } from "@/lib/format";
import { detectBarcodePrinter } from "@/lib/server/barcode-printer";
import { getSyncLogPath } from "@/lib/server/sync-log";
import { getWorkspaceRevision } from "@/lib/server/workspace-store";

export async function GET() {
  const printer = await detectBarcodePrinter();
  const revision = await getWorkspaceRevision();
  return NextResponse.json({
    ok: true,
    service: "otpravki",
    syncApi: Boolean(process.env.SYNC_API_URL),
    socketReady: Boolean((globalThis as { __workspaceIo?: unknown }).__workspaceIo),
    revision,
    syncLog: getSyncLogPath(),
    syncLogApi: "/api/sync/log",
    printer: printer ?? null,
    time: formatMoscowIso(),
    timezone: "Europe/Moscow",
  });
}
