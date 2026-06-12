import { NextResponse } from "next/server";
import { requireMutatingAuth } from "@/lib/server/api-auth";
import { applyWorkspaceUpdate } from "@/lib/server/workspace-store";
import type { WorkspaceState } from "@/types/workspace";

/** @deprecated Используйте POST /api/workspace */
export async function POST(request: Request) {
  const authError = requireMutatingAuth(request);
  if (authError) return authError;

  try {
    const payload = (await request.json()) as WorkspaceState & { clientId?: string };
    if (!payload.assemblyItems || !payload.orders) {
      return NextResponse.json({ ok: false, error: "Invalid workspace" }, { status: 400 });
    }
    const workspace = await applyWorkspaceUpdate(payload, payload.clientId ?? "legacy");

    return NextResponse.json({
      ok: true,
      workspace,
      savedLocally: true,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
