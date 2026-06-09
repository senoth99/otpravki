import { NextResponse } from "next/server";
import { getWorkspaceRevision } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const revision = await getWorkspaceRevision();
  return NextResponse.json(
    { revision },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
