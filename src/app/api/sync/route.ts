import { NextResponse } from "next/server";
import { applyWorkspaceUpdate } from "@/lib/server/workspace-store";
import type { WorkspaceState } from "@/types/workspace";

/** @deprecated Используйте POST /api/workspace */
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as WorkspaceState & { clientId?: string };
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
