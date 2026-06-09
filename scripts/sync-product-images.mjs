#!/usr/bin/env node
/**
 * Скачивает картинки товаров на сервер (только недостающие).
 * Используется в deploy.sh и: npm run sync-images
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = process.argv[2] ?? path.join(process.cwd(), "data");
const apiBase = (process.argv[3] ?? process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com").replace(
  /\/$/,
  "",
);

const productsFile = path.join(dataDir, "cache", "products.json");
const imagesDir = path.join(dataDir, "cache", "images");

function imagePathToRelative(imagePath) {
  const trimmed = String(imagePath ?? "").trim();
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
  if (!normalized.startsWith("uploads/") || normalized.includes("..")) return null;
  return normalized;
}

function collectImagePaths(products) {
  const paths = new Set();
  for (const product of products) {
    for (const image of product.images ?? []) {
      const relative = imagePathToRelative(image);
      if (relative) paths.add(relative);
    }
  }
  return [...paths];
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function downloadImage(relativePath) {
  const remoteUrl = `${apiBase}/${relativePath}`;
  const localPath = path.join(imagesDir, relativePath);

  const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error("empty response");

  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, buffer);
}

async function main() {
  let products;
  try {
    const raw = await readFile(productsFile, "utf-8");
    products = JSON.parse(raw).data ?? [];
  } catch {
    console.log("    нет кэша товаров — пропускаю картинки");
    return;
  }

  const imagePaths = collectImagePaths(products);
  if (imagePaths.length === 0) {
    console.log("    картинок в каталоге нет");
    return;
  }

  await mkdir(imagesDir, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const relativePath of imagePaths) {
    const localPath = path.join(imagesDir, relativePath);
    if (await fileExists(localPath)) {
      skipped += 1;
      continue;
    }

    try {
      await downloadImage(relativePath);
      downloaded += 1;
    } catch {
      failed += 1;
    }
  }

  console.log(
    `    картинки: всего ${imagePaths.length}, новых ${downloaded}, на диске ${skipped}, ошибок ${failed}`,
  );
}

main().catch((error) => {
  console.error("    ошибка синхронизации картинок:", error.message ?? error);
  process.exit(1);
});
