import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { getSyncLogPath, logSync, readSyncLog } from "@/lib/server/sync-log";
import { getWorkspaceRevision } from "@/lib/server/workspace-store";

const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const MAX_PAYLOAD_BYTES = 8_192;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

const postCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = postCounts.get(key);
  if (!entry || now >= entry.resetAt) {
    postCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLines = Number(searchParams.get("lines") ?? 100);
  const lines = Math.min(500, Math.max(1, Number.isFinite(rawLines) ? rawLines : 100));

  const [entries, revision] = await Promise.all([readSyncLog(lines), getWorkspaceRevision()]);
  const socketReady = Boolean(
    (globalThis as { __workspaceIo?: unknown }).__workspaceIo,
  );
  const isProd = process.env.NODE_ENV === "production";

  return NextResponse.json(
    {
      ok: true,
      revision,
      socketReady,
      ...(isProd ? {} : { logFile: getSyncLogPath() }),
      count: entries.length,
      entries,
    },
    { headers: NO_CACHE },
  );
}

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  const clientKey = request.headers.get("x-forwarded-for") ?? "local";
  if (isRateLimited(clientKey)) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const raw = await request.text();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
    }

    const body = JSON.parse(raw) as {
      type?: string;
      clientId?: string;
      message?: string;
      revision?: number;
      meta?: Record<string, unknown>;
    };

    if (!body.type || body.type.length > 120) {
      return NextResponse.json({ ok: false, error: "type required" }, { status: 400 });
    }

    await logSync(`client.${body.type}`, {
      clientId: body.clientId ?? "unknown",
      message: typeof body.message === "string" ? body.message.slice(0, 500) : undefined,
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
