import { readFile, realpath } from "fs/promises";
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

  const imagesDir = await realpath(path.resolve(getImagesCacheDir()));
  const candidate = path.resolve(imagesDir, relative);

  if (!candidate.startsWith(`${imagesDir}${path.sep}`) && candidate !== imagesDir) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  let filePath: string;
  try {
    filePath = await realpath(candidate);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

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
