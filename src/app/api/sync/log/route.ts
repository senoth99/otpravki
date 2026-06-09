import { NextResponse } from "next/server";
import { getSyncLogPath, logSync, readSyncLog } from "@/lib/server/sync-log";
import { getWorkspaceRevision } from "@/lib/server/workspace-store";

const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lines = Math.min(500, Math.max(1, Number(searchParams.get("lines") ?? 100) || 100));

  const [entries, revision] = await Promise.all([readSyncLog(lines), getWorkspaceRevision()]);
  const socketReady = Boolean(
    (globalThis as { __workspaceIo?: unknown }).__workspaceIo,
  );

  return NextResponse.json(
    {
      ok: true,
      revision,
      socketReady,
      logFile: getSyncLogPath(),
      count: entries.length,
      entries,
    },
    { headers: NO_CACHE },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: string;
      clientId?: string;
      message?: string;
      revision?: number;
      meta?: Record<string, unknown>;
    };

    if (!body.type) {
      return NextResponse.json({ ok: false, error: "type required" }, { status: 400 });
    }

    await logSync(`client.${body.type}`, {
      clientId: body.clientId ?? "unknown",
      message: body.message,
      revision: body.revision,
      ...body.meta,
    });

    return NextResponse.json({ ok: true }, { headers: NO_CACHE });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "log failed" },
      { status: 500 },
    );
  }
}
