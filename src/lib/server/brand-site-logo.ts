import sharp from "sharp";
import { externalFetch } from "@/lib/server/external-fetch";
import { BOX_LABEL_BRANDS, type BoxLabelBrandId } from "@/lib/box-label-brands";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type LogoCacheEntry = {
  png: Buffer;
  sourceUrl: string;
  expiresAt: number;
};

const logoCache = new Map<BoxLabelBrandId, LogoCacheEntry>();

function absUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function isGifUrl(url: string): boolean {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  return path.endsWith(".gif");
}

function extractAttr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
  const m = tag.match(re);
  return m?.[1]?.trim() || null;
}

/** Картинки из header / nav / ссылок на иконки. */
function collectLogoCandidates(html: string, site: string): { header: string[]; icons: string[] } {
  const header: string[] = [];
  const icons: string[] = [];
  const seen = new Set<string>();

  const push = (list: string[], href: string | null | undefined) => {
    if (!href) return;
    const url = absUrl(site, href);
    if (!url || seen.has(url)) return;
    if (!/\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(url) && !/brand-assets|favicon|logo|icon/i.test(url)) {
      return;
    }
    seen.add(url);
    list.push(url);
  };

  const headerMatch = html.match(/<header\b[\s\S]{0,12000}?<\/header>/i);
  const headerHtml = headerMatch?.[0] ?? "";
  const navMatch = html.match(/<nav\b[\s\S]{0,8000}?<\/nav>/i);
  const searchHtml = `${headerHtml}\n${navMatch?.[0] ?? ""}\n${html.slice(0, 80_000)}`;

  for (const img of searchHtml.matchAll(/<img\b[^>]*>/gi)) {
    const tag = img[0];
    const cls = `${extractAttr(tag, "class") ?? ""} ${extractAttr(tag, "alt") ?? ""} ${extractAttr(tag, "id") ?? ""}`;
    const src = extractAttr(tag, "src") ?? extractAttr(tag, "data-src");
    if (/logo|brand|header/i.test(cls) || /logo|brand/i.test(src ?? "")) {
      push(header, src);
    }
  }

  // brand-assets из разметки (часто это и есть логотип в хедере на этих сайтах)
  for (const m of html.matchAll(/https:\/\/amarix-media\.storage\.yandexcloud\.net\/brand-assets\/[^"'\\\s>]+/gi)) {
    const url = m[0].replace(/\\+$/, "");
    if (/\/hero\//i.test(url)) continue;
    push(header, url);
  }

  for (const link of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = link[0];
    const rel = (extractAttr(tag, "rel") ?? "").toLowerCase();
    if (!rel.includes("icon") && !rel.includes("apple-touch-icon") && !rel.includes("shortcut")) {
      continue;
    }
    push(icons, extractAttr(tag, "href"));
  }

  return { header, icons };
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await externalFetch(url, {
      timeoutMs: 15_000,
      headers: {
        Accept: "image/*,*/*",
        "User-Agent": "Mozilla/5.0 (compatible; OtpravkiBoxLabel/1.0)",
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) return null;
    return buf;
  } catch {
    return null;
  }
}

async function toPrintablePng(buf: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buf, { animated: true, pages: 1 })
      .rotate()
      .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: false })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .grayscale()
      .png({ compressionLevel: 8 })
      .toBuffer();
  } catch {
    try {
      return await sharp(buf)
        .rotate()
        .resize({ width: 600, height: 600, fit: "inside" })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .grayscale()
        .png({ compressionLevel: 8 })
        .toBuffer();
    } catch {
      return null;
    }
  }
}

async function resolveLogoFromSite(site: string): Promise<{ png: Buffer; sourceUrl: string }> {
  const res = await externalFetch(site, {
    timeoutMs: 15_000,
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; OtpravkiBoxLabel/1.0)",
    },
  });
  if (!res.ok) {
    throw new Error(`Не удалось открыть ${site} (${res.status})`);
  }
  const html = await res.text();
  const { header, icons } = collectLogoCandidates(html, site);

  // С хедера; если гифка — берём favicon (не-gif предпочтительнее).
  let candidates = [...header];
  const first = candidates[0];
  if (first && isGifUrl(first)) {
    const nonGifIcons = icons.filter((u) => !isGifUrl(u));
    candidates = nonGifIcons.length > 0 ? nonGifIcons : [...icons, ...candidates];
  } else if (candidates.length === 0) {
    candidates = [...icons];
  } else {
    candidates = [...candidates, ...icons];
  }

  // запасные пути
  for (const path of ["/apple-touch-icon.png", "/favicon.ico", "/favicon.png"]) {
    const url = absUrl(site, path);
    if (url && !candidates.includes(url)) candidates.push(url);
  }

  let lastError: string | null = null;
  for (const url of candidates) {
    const raw = await fetchBytes(url);
    if (!raw) {
      lastError = `пусто: ${url}`;
      continue;
    }
    const png = await toPrintablePng(raw);
    if (!png) {
      lastError = `не картинка: ${url}`;
      continue;
    }
    return { png, sourceUrl: url };
  }

  throw new Error(lastError ?? `Логотип не найден на ${site}`);
}

export async function getBrandSiteLogo(brandId: BoxLabelBrandId): Promise<{
  png: Buffer;
  sourceUrl: string;
}> {
  const cached = logoCache.get(brandId);
  if (cached && cached.expiresAt > Date.now()) {
    return { png: cached.png, sourceUrl: cached.sourceUrl };
  }

  const brand = BOX_LABEL_BRANDS.find((b) => b.id === brandId);
  if (!brand) throw new Error("Неизвестный бренд");

  const resolved = await resolveLogoFromSite(brand.site);
  logoCache.set(brandId, {
    png: resolved.png,
    sourceUrl: resolved.sourceUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return resolved;
}
