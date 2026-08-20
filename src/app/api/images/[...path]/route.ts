import { NextResponse } from "next/server";
import { externalFetch } from "@/lib/server/external-fetch";
import { getImageContentType } from "@/lib/server/image-cache";

export const dynamic = "force-dynamic";

const API_BASE = process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com";
const YANDEX_MEDIA = "https://amarix-media.storage.yandexcloud.net";
const STOREFRONT_IMAGE =
  process.env.PRODUCT_IMAGE_PROXY_ORIGIN ?? "https://cashercollection.com";

function storefrontImageUrl(remoteUrl: string): string {
  const encoded = encodeURIComponent(remoteUrl);
  return `${STOREFRONT_IMAGE.replace(/\/$/, "")}/_next/image?url=${encoded}&w=1080&q=75`;
}

async function fetchRemoteImage(remoteUrl: string): Promise<Response> {
  try {
    const res = await externalFetch(remoteUrl, { timeoutMs: 12_000 });
    if (res.ok) return res;
  } catch {
    // прямое хранилище часто рвёт TLS — ниже запасной прокси витрины
  }

  if (remoteUrl.startsWith(YANDEX_MEDIA)) {
    const fallback = await externalFetch(storefrontImageUrl(remoteUrl), {
      timeoutMs: 15_000,
    });
    if (fallback.ok) return fallback;
  }

  throw new Error("image fetch failed");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  if (!segments.length || segments.some((part) => part === ".." || part.includes(".."))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  let remoteUrl: string;
  if (segments[0] === "yc") {
    const rest = segments.slice(1).join("/");
    if (!rest) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    remoteUrl = `${YANDEX_MEDIA}/${rest}`;
  } else {
    const relative = segments.join("/");
    if (!relative.startsWith("uploads/")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    remoteUrl = `${API_BASE.replace(/\/$/, "")}/${relative}`;
  }

  try {
    const res = await fetchRemoteImage(remoteUrl);
    const data = Buffer.from(await res.arrayBuffer());
    return new NextResponse(data, {
      headers: {
        "Content-Type":
          res.headers.get("content-type") ?? getImageContentType(remoteUrl),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
