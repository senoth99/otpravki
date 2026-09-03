import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/server/admin-pin";
import { createBrandInvite } from "@/lib/server/brands-store";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ ok: false, error: "Требуется PIN админки" }, { status: 401 });
  }
  const invite = await createBrandInvite();
  return NextResponse.json({
    ok: true,
    inviteId: invite.id,
    expiresAt: invite.expiresAt,
  });
}
