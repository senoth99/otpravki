import { NextResponse } from "next/server";
import { applyWorkspaceUpdate, getSharedWorkspace } from "@/lib/server/workspace-store";
import type { WorkspaceState } from "@/types/workspace";

export async function GET() {
  const workspace = await getSharedWorkspace();
  if (!workspace) {
    return NextResponse.json({ workspace: null });
  }
  return NextResponse.json({ workspace });
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

    const workspace = await applyWorkspaceUpdate(
      body.workspace,
      body.clientId ?? "unknown",
    );

    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Update failed" },
      { status: 500 },
    );
  }
}
