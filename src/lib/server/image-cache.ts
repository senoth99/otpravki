import { mkdir, readFile, rename, stat, writeFile } from "fs/promises";
import path from "path";
import { externalFetch } from "@/lib/server/external-fetch";
import type { ApiProduct } from "@/types/shipping";

const API_BASE = process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com";
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const PRODUCTS_FILE = path.join(CACHE_DIR, "products.json");
const IMAGES_DIR = path.join(CACHE_DIR, "images");

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export interface ImageSyncResult {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
}

interface CacheEntry {
  data: ApiProduct[];
}

/** Относительный путь внутри images/ (uploads/...) */
export function imagePathToRelative(imagePath: string): string | null {
  const trimmed = imagePath.trim();
  if (!trimmed) return null;

  let pathname = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }

  const normalized = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  if (!normalized.startsWith("uploads/")) return null;
  if (normalized.includes("..")) return null;

  return normalized;
}

export function getImagesCacheDir(): string {
  return IMAGES_DIR;
}

export function getImageContentType(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function collectImagePathsFromProducts(products: ApiProduct[]): string[] {
  const paths = new Set<string>();

  for (const product of products) {
    for (const image of product.images ?? []) {
      const relative = imagePathToRelative(image);
      if (relative) paths.add(relative);
    }
  }

  return [...paths];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function isValidImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }
  if (buffer.slice(0, 3).toString() === "GIF") return true;
  if (
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString() === "RIFF" &&
    buffer.slice(8, 12).toString() === "WEBP"
  ) {
    return true;
  }
  const start = buffer.slice(0, 100).toString("utf8").trimStart();
  return start.startsWith("<svg") || start.startsWith("<?xml");
}

async function downloadImage(relativePath: string): Promise<void> {
  const remoteUrl = `${API_BASE.replace(/\/$/, "")}/${relativePath}`;
  const localPath = path.join(IMAGES_DIR, relativePath);

  const res = await externalFetch(remoteUrl, { timeoutMs: 30_000 });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("empty response");
  }
  if (!isValidImageBuffer(buffer)) {
    throw new Error("invalid image data");
  }

  await mkdir(path.dirname(localPath), { recursive: true });
  const tmpPath = `${localPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, buffer);
  await rename(tmpPath, localPath);
}

export async function syncProductImages(
  products?: ApiProduct[],
): Promise<ImageSyncResult> {
  let list = products;

  if (!list) {
    try {
      const raw = await readFile(PRODUCTS_FILE, "utf-8");
      list = (JSON.parse(raw) as CacheEntry).data ?? [];
    } catch {
      return { total: 0, downloaded: 0, skipped: 0, failed: 0 };
    }
  }

  const imagePaths = collectImagePathsFromProducts(list);
  const result: ImageSyncResult = {
    total: imagePaths.length,
    downloaded: 0,
    skipped: 0,
    failed: 0,
  };

  if (imagePaths.length === 0) return result;

  await mkdir(IMAGES_DIR, { recursive: true });

  for (const relativePath of imagePaths) {
    const localPath = path.join(IMAGES_DIR, relativePath);

    if (await fileExists(localPath)) {
      result.skipped += 1;
      continue;
    }

    try {
      await downloadImage(relativePath);
      result.downloaded += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
