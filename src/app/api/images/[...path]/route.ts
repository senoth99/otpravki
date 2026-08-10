import { NextResponse } from "next/server";
import { externalFetch } from "@/lib/server/external-fetch";
import { getImageContentType } from "@/lib/server/image-cache";

export const dynamic = "force-dynamic";

const API_BASE = process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  const relative = segments.join("/");

  if (!relative || relative.includes("..") || !relative.startsWith("uploads/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const remoteUrl = `${API_BASE.replace(/\/$/, "")}/${relative}`;

  try {
    const res = await externalFetch(remoteUrl, { timeoutMs: 20_000 });
    if (!res.ok) {
      return new NextResponse(null, { status: res.status === 404 ? 404 : 502 });
    }

    const data = Buffer.from(await res.arrayBuffer());
    return new NextResponse(data, {
      headers: {
        "Content-Type":
          res.headers.get("content-type") ?? getImageContentType(relative),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
