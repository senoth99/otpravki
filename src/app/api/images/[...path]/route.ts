import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getImageContentType, getImagesCacheDir } from "@/lib/server/image-cache";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  const relative = segments.join("/");

  if (!relative || relative.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const imagesDir = path.resolve(getImagesCacheDir());
  const filePath = path.resolve(imagesDir, relative);

  if (!filePath.startsWith(`${imagesDir}${path.sep}`) && filePath !== imagesDir) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": getImageContentType(filePath),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
