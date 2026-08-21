import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import {
  applyAssemblyProgressPatch,
  getAssemblyProgress,
  type AssemblyProgressEntry,
} from "@/lib/server/assembly-progress-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const progress = await getAssemblyProgress();
  return NextResponse.json({ ok: true, progress });
}

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as {
    clientId?: unknown;
    items?: unknown;
  };

  const clientId = typeof body.clientId === "string" ? body.clientId : "client";
  const patch: Record<string, AssemblyProgressEntry> = {};

  if (body.items && typeof body.items === "object" && !Array.isArray(body.items)) {
    for (const [id, value] of Object.entries(body.items as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const row = value as { collectedCount?: unknown; collectedAt?: unknown };
      if (typeof row.collectedCount !== "number") continue;
      patch[id] = {
        collectedCount: row.collectedCount,
        collectedAt: typeof row.collectedAt === "number" ? row.collectedAt : undefined,
      };
    }
  } else if (Array.isArray(body.items)) {
    for (const row of body.items) {
      if (!row || typeof row !== "object") continue;
      const item = row as { id?: unknown; collectedCount?: unknown; collectedAt?: unknown };
      if (typeof item.id !== "string" || typeof item.collectedCount !== "number") continue;
      patch[item.id] = {
        collectedCount: item.collectedCount,
        collectedAt: typeof item.collectedAt === "number" ? item.collectedAt : undefined,
      };
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Нет изменений сборки" }, { status: 400 });
  }

  const progress = await applyAssemblyProgressPatch(patch, clientId);
  return NextResponse.json({ ok: true, progress });
}
