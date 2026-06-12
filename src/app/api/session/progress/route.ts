import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { saveSessionProgress } from "@/lib/server/session-progress-store";
import { applySessionProgressToMemory } from "@/lib/server/workspace-store";
import type { SharedWorkspaceState } from "@/types/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as { workspace?: SharedWorkspaceState };
    if (!body.workspace?.assemblyItems || !body.workspace?.orders) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    await saveSessionProgress(body.workspace);

    const updated = await applySessionProgressToMemory(
      body.workspace.assemblyItems,
      body.workspace.orders,
    );
    if (updated) {
      return NextResponse.json({ ok: true, revision: updated.revision });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Save failed" },
      { status: 500 },
    );
  }
}
