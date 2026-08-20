import { NextResponse } from "next/server";
import { createGuide, listGuides, setGuideLocked } from "@/lib/server/guides-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const guides = await listGuides();
  return NextResponse.json({ ok: true, guides });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "Нужно название темы" }, { status: 400 });
  }

  try {
    const guide = await createGuide(title);
    return NextResponse.json({ ok: true, guide });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать тему";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { slug?: unknown; locked?: unknown };
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Нет темы" }, { status: 400 });
  }

  const guide = await setGuideLocked(slug, body.locked === true);
  if (!guide) {
    return NextResponse.json({ ok: false, error: "Тема не найдена" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, guide });
}
