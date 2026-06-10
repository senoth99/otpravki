import { NextResponse } from "next/server";
import {
  applySessionProgress,
  loadSessionProgress,
  saveSessionProgress,
} from "@/lib/server/session-progress-store";
import { getSharedWorkspace } from "@/lib/server/workspace-store";
import type { SharedWorkspaceState } from "@/types/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workspace?: SharedWorkspaceState };
    if (!body.workspace?.assemblyItems || !body.workspace?.orders) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    await saveSessionProgress(body.workspace);

    const current = await getSharedWorkspace();
    if (current) {
      const progress = await loadSessionProgress();
      const merged = applySessionProgress(
        { ...current, assemblyItems: body.workspace.assemblyItems, orders: body.workspace.orders },
        progress,
      );
      return NextResponse.json({ ok: true, revision: current.revision });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Save failed" },
      { status: 500 },
    );
  }
}
