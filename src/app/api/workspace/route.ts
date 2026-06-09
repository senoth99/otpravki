import { NextResponse } from "next/server";
import { logSync } from "@/lib/server/sync-log";
import { applyWorkspaceUpdate, getSharedWorkspace } from "@/lib/server/workspace-store";
import type { WorkspaceState } from "@/types/workspace";

const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET() {
  const workspace = await getSharedWorkspace();
  if (!workspace) {
    return NextResponse.json({ workspace: null }, { headers: NO_CACHE });
  }
  return NextResponse.json({ workspace }, { headers: NO_CACHE });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspace: WorkspaceState;
      clientId?: string;
    };

    if (!body.workspace?.assemblyItems || !body.workspace?.orders) {
      return NextResponse.json({ ok: false, error: "Invalid workspace" }, { status: 400 });
    }

    const clientId = body.clientId ?? "unknown";
    void logSync("api.workspace.post", {
      clientId,
      orders: body.workspace.orders.length,
      updatedAt: body.workspace.updatedAt,
    });

    const workspace = await applyWorkspaceUpdate(body.workspace, clientId);

    return NextResponse.json({ ok: true, workspace }, { headers: NO_CACHE });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Update failed" },
      { status: 500 },
    );
  }
}
