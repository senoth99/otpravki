import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { boxLabelBrandIdFromStoreBrand } from "@/lib/box-label-brands";
import { code128ModuleCount, encodeCode128B } from "@/lib/server/code128";
import { getBrandSiteLogo } from "@/lib/server/brand-site-logo";
import { externalFetch } from "@/lib/server/external-fetch";
import type { ShippingOrder, ShippingOrderItem } from "@/types/shipping";

/** Альбом 6×4″ (150×100 мм) */
const PAGE_W = 6 * 72;
const PAGE_H = 4 * 72;
const MARGIN = 6;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

const YANDEX_MEDIA = "https://amarix-media.storage.yandexcloud.net";

export type TrackLabelInput = {
  brand?: string;
  orderNumber: string;
  trackingNumber: string;
  city?: string;
  customerName?: string;
  items: Array<{
    productName: string;
    size: string;
    quantity: number;
    imageUrl?: string;
    chestnyZnak?: string | null;
  }>;
};

function labelsDirCandidates(): string[] {
  const extra = process.env.APP_DIR?.trim();
  return [
    extra ? path.join(extra, "labels") : "",
    path.join(process.cwd(), "labels"),
    path.join(process.cwd(), "..", "labels"),
    path.join(process.cwd(), "..", "..", "labels"),
  ].filter(Boolean);
}

function resolveFont(file: string): string {
  for (const dir of labelsDirCandidates()) {
    const full = path.join(dir, "fonts", file);
    if (existsSync(full)) return full;
  }
  throw new Error(`Нет шрифта labels/fonts/${file}`);
}

function resolveLabelAsset(file: string): string {
  for (const dir of labelsDirCandidates()) {
    const full = path.join(dir, file);
    if (existsSync(full)) return full;
  }
  throw new Error(`Нет файла labels/${file}`);
}

/** Вырез в макете Casher (123.pdf) под штрихкод / трек / заказ */
const CASHER_STROKE_HOLE = {
  x0: 0.312,
  x1: 0.686,
  y0: 0.22,
  y1: 0.76,
} as const;

export function brandDisplayName(brand?: string): string {
  const value = (brand ?? "").trim();
  if (!value) return "CA$HER";
  const lower = value.toLowerCase();
  if (lower === "ammo" || lower === "ammd" || lower.includes("ammo") || lower.includes("ammd")) {
    return "AMMO";
  }
  if (lower.includes("кураж") || lower.includes("kurazh")) return "КУРАЖ";
  if (
    lower.includes("casher") ||
    lower.includes("кэшер") ||
    lower.includes("кешер") ||
    lower.includes("ca$her")
  ) {
    return "CA$HER";
  }
  return value.toUpperCase();
}

export function isCasherBrand(brand?: string): boolean {
  const lower = (brand ?? "").trim().toLowerCase();
  if (!lower) return true;
  return (
    lower.includes("casher") ||
    lower.includes("кэшер") ||
    lower.includes("кешер") ||
    lower.includes("ca$her")
  );
}

export function brandSiteUrl(brand?: string): string {
  const lower = (brand ?? "").trim().toLowerCase();
  if (lower === "ammo" || lower === "ammd" || lower.includes("ammo") || lower.includes("ammd")) {
    return "https://ammobrand.ru";
  }
  if (lower.includes("кураж") || lower.includes("kurazh")) {
    return "https://kurazhdvizh.com";
  }
  return "https://cashercollection.com";
}

function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const raw = text.trim().replace(/\s+/g, " ");
  if (!raw) return [];
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return [raw];

  const words = raw.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) {
        current = word;
        break;
      }
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      let chunk = "";
      for (const ch of word) {
        const next = chunk + ch;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) chunk = next;
        else {
          if (chunk) lines.push(chunk);
          chunk = ch;
          if (lines.length >= maxLines) break;
        }
      }
      current = chunk;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  const fitted = lines.slice(0, maxLines);
  const joined = fitted.join(" ");
  if (joined !== raw && fitted.length > 0) {
    let last = fitted[fitted.length - 1].replace(/…$/, "");
    while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) {
      last = last.slice(0, -1);
    }
    fitted[fitted.length - 1] = `${last}…`;
  }
  return fitted;
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  y: number,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_W - width) / 2,
    y,
    size,
    font,
    color: BLACK,
  });
}

function drawCenteredIn(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  y: number,
  leftX: number,
  width: number,
) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: leftX + Math.max(0, (width - tw) / 2),
    y,
    size,
    font,
    color: BLACK,
  });
}

function drawCode128(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const modules = encodeCode128B(text);
  const total = modules.reduce((a, b) => a + b, 0);
  const unit = width / total;
  let cursor = x;
  let bar = true;
  for (const w of modules) {
    const span = w * unit;
    if (bar) {
      page.drawRectangle({
        x: cursor,
        y,
        width: Math.max(0.35, span),
        height,
        color: BLACK,
      });
    }
    cursor += span;
    bar = !bar;
  }
}

const STOREFRONT =
  process.env.PRODUCT_IMAGE_PROXY_ORIGIN?.replace(/\/$/, "") ?? "https://cashercollection.com";

function storefrontProxy(remoteUrl: string): string {
  return `${STOREFRONT}/_next/image?url=${encodeURIComponent(remoteUrl)}&w=256&q=70`;
}

/**
 * Кандидаты URL для картинки товара.
 * Не ходим на localhost /api/images — во время печати это часто дедлочит Node.
 */
function remoteCandidates(imageUrl?: string): string[] {
  if (!imageUrl?.trim()) return [];
  const raw = imageUrl.trim();
  const out: string[] = [];
  const add = (url: string) => {
    if (url && !out.includes(url)) out.push(url);
  };
  const addYandex = (objectPath: string) => {
    const remote = `${YANDEX_MEDIA}/${objectPath.replace(/^\//, "")}`;
    add(remote);
    add(storefrontProxy(remote));
  };

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      if (u.hostname === "amarix-media.storage.yandexcloud.net") {
        addYandex(u.pathname);
        return out;
      }
    } catch {
      // fall through
    }
    add(raw);
    add(storefrontProxy(raw));
    return out;
  }

  // UI хранит пути вида /api/images/yc/products/...webp
  if (raw.startsWith("/api/images/yc/")) {
    addYandex(raw.slice("/api/images/yc/".length));
    return out;
  }

  if (raw.startsWith("/api/images/")) {
    const rest = raw.slice("/api/images/".length);
    // uploads/products/{file} → тот же объект в Yandex
    const uploadsMatch = rest.match(
      /^uploads\/products\/([^/?#]+\.(?:webp|jpe?g|png|gif|avif))$/i,
    );
    if (uploadsMatch) {
      addYandex(`products/products/${uploadsMatch[1]}`);
    }
    const base = (process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com").replace(
      /\/$/,
      "",
    );
    const remote = `${base}/${rest}`;
    add(remote);
    add(storefrontProxy(remote));
  }

  return out;
}

function isJpeg(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

function isPng(buf: Buffer): boolean {
  return (
    buf.length > 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  );
}

async function fetchRaw(url: string): Promise<Buffer | null> {
  try {
    const res = await externalFetch(url, { timeoutMs: 10_000 });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= 64 ? buf : null;
  } catch {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length >= 64 ? buf : null;
    } catch {
      return null;
    }
  }
}

async function toEmbeddablePng(buf: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buf)
      .rotate()
      .resize({ width: 280, height: 280, fit: "inside", withoutEnlargement: true })
      .grayscale()
      .png({ compressionLevel: 8 })
      .toBuffer();
  } catch {
    if (isJpeg(buf) || isPng(buf)) return buf;
    return null;
  }
}

async function fetchImageBytes(imageUrl?: string): Promise<Uint8Array | null> {
  for (const remote of remoteCandidates(imageUrl)) {
    const buf = await fetchRaw(remote);
    if (!buf) continue;
    const png = await toEmbeddablePng(buf);
    if (png) return new Uint8Array(png);
  }
  return null;
}

async function embedProductImage(pdf: PDFDocument, imageUrl?: string): Promise<PDFImage | null> {
  const bytes = await fetchImageBytes(imageUrl);
  if (!bytes) return null;
  try {
    const buf = Buffer.from(bytes);
    if (isJpeg(buf)) return await pdf.embedJpg(bytes);
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

async function embedQrPng(pdf: PDFDocument, payload: string, px = 240): Promise<PDFImage> {
  const buf = await QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: px,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return pdf.embedPng(buf);
}

async function embedCasherStrokePage(pdf: PDFDocument): Promise<{
  draw: (page: PDFPage) => void;
}> {
  const pdfPath = (() => {
    for (const name of ["casher-track-stroke.pdf", "casher-track-template.pdf"]) {
      try {
        return resolveLabelAsset(name);
      } catch {
        // next
      }
    }
    return null;
  })();

  if (pdfPath) {
    const bytes = await readFile(pdfPath);
    const [embedded] = await pdf.embedPdf(bytes, [0]);
    return {
      draw: (page: PDFPage) => {
        page.drawPage(embedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
      },
    };
  }

  // запас: старый PNG
  const raw = await readFile(resolveLabelAsset("casher-track-stroke.png"));
  const png = await sharp(raw)
    .ensureAlpha()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(1800, 1200, { kernel: "nearest", fit: "fill" })
    .grayscale()
    .threshold(160)
    .png({ compressionLevel: 9, palette: true, colors: 2 })
    .toBuffer();
  const image = await pdf.embedPng(png);
  return {
    draw: (page: PDFPage) => {
      page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    },
  };
}

/** Casher: векторный макет на весь лист + barcode/трек/заказ в центре */
async function buildCasherTrackLabelPdf(
  pdf: PDFDocument,
  page: PDFPage,
  bold: PDFFont,
  track: string,
  orderNo: string,
): Promise<void> {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const stroke = await embedCasherStrokePage(pdf);
  stroke.draw(page);

  const holeX = PAGE_W * CASHER_STROKE_HOLE.x0;
  const holeW = PAGE_W * (CASHER_STROKE_HOLE.x1 - CASHER_STROKE_HOLE.x0);
  const holeTop = PAGE_H * (1 - CASHER_STROKE_HOLE.y0);
  const holeBottom = PAGE_H * (1 - CASHER_STROKE_HOLE.y1);
  const holeH = Math.max(24, holeTop - holeBottom);

  // закрываем старый barcode/номер из макета
  page.drawRectangle({
    x: holeX,
    y: holeBottom,
    width: holeW,
    height: holeH,
    color: WHITE,
  });

  const padX = 8;
  const padY = 6;
  const orderSize = orderNo.length > 16 ? 12 : 14;
  const trackSize = track.length > 14 ? 14 : 16;
  const textBlock = trackSize + 5 + orderSize + 5;
  const barcodeH = Math.max(42, holeH - textBlock - padY * 2);
  const barcodeY = holeTop - padY - barcodeH;

  try {
    void code128ModuleCount(track);
    drawCode128(page, track, holeX + padX, barcodeY, holeW - padX * 2, barcodeH);
  } catch {
    page.drawRectangle({
      x: holeX + padX,
      y: barcodeY,
      width: holeW - padX * 2,
      height: barcodeH,
      borderColor: BLACK,
      borderWidth: 1.2,
    });
  }

  const trackY = barcodeY - trackSize - 4;
  drawCenteredIn(page, bold, track, trackSize, trackY, holeX, holeW);
  drawCenteredIn(page, bold, orderNo, orderSize, trackY - orderSize - 5, holeX, holeW);
}

function drawZoneFrame(page: PDFPage, x: number, y: number, w: number, h: number) {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: BLACK,
    borderWidth: 1.2,
    color: WHITE,
  });
}

function drawZoneTitle(page: PDFPage, font: PDFFont, title: string, x: number, top: number) {
  const size = 8;
  const pad = 3;
  const tw = font.widthOfTextAtSize(title, size);
  page.drawRectangle({
    x: x + 6,
    y: top - size / 2 - 1,
    width: tw + pad * 2,
    height: size + 2,
    color: WHITE,
  });
  page.drawText(title, {
    x: x + 6 + pad,
    y: top - size / 2,
    size,
    font,
    color: BLACK,
  });
}

export function trackLabelFromOrder(
  order: ShippingOrder,
  trackingOverride?: string,
): TrackLabelInput {
  const tracking =
    trackingOverride?.trim() ||
    order.trackingNumber?.trim() ||
    order.orderNumber;
  return {
    brand: order.storeBrand,
    orderNumber: order.orderNumber,
    trackingNumber: tracking,
    city: order.city,
    customerName: order.customerName,
    items: order.items.map((item: ShippingOrderItem) => ({
      productName: item.productName,
      size: item.size,
      quantity: item.quantity,
      imageUrl: item.imageUrl,
      chestnyZnak: item.chestnyZnak,
    })),
  };
}

export type TestTrackBrand = "casher" | "ammo" | "kurazh";

export function sampleTrackLabelInput(brand: TestTrackBrand = "casher"): TrackLabelInput {
  const byBrand: Record<
    TestTrackBrand,
    { brand: string; orderNumber: string; productName: string }
  > = {
    casher: {
      brand: "CASHER",
      orderNumber: "бв19",
      productName: "ШТАНЫ LIGHT CLASSIC",
    },
    ammo: {
      brand: "AMMO",
      orderNumber: "ам42",
      productName: "ФУТБОЛКА ONLY 52",
    },
    kurazh: {
      brand: "KURAZHDVIZH",
      orderNumber: "т301",
      productName: 'ДЖЕРСИ "ЖИТЬ В КАЙФ" YELLOW',
    },
  };
  const meta = byBrand[brand] ?? byBrand.casher;
  return {
    brand: meta.brand,
    orderNumber: meta.orderNumber,
    trackingNumber: "10300912367",
    city: "Москва",
    customerName: "Иванов Иван Иванович",
    items: [
      {
        productName: meta.productName,
        size: "M",
        quantity: 1,
        chestnyZnak: null,
        imageUrl:
          "https://amarix-media.storage.yandexcloud.net/products/products/622cd129-1f41-4fdb-afc7-c8a77e01a47b.webp",
      },
    ],
  };
}

/** Альбомная этикетка трека 150×100 (6×4″). */
export async function buildTrackLabelPdf(input: TrackLabelInput): Promise<Buffer> {
  const casher = isCasherBrand(input.brand);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const [regularBytes, boldBytes] = await Promise.all([
    readFile(resolveFont("DejaVuSans.ttf")),
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
  ]);
  const font = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });

  const track = input.trackingNumber.replace(/\s+/g, "");
  const orderNo = input.orderNumber.trim();

  // Casher — только полноразмерный макет, без доп.инфо / сайта / зон
  if (casher) {
    await buildCasherTrackLabelPdf(pdf, page, bold, track, orderNo);
    return Buffer.from(await pdf.save());
  }

  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const brand = brandDisplayName(input.brand);
  const brandId = boxLabelBrandIdFromStoreBrand(input.brand);
  // Фиксированная шапка с запасом от края этикетки (термопринтер часто «съедает» 1–2 мм).
  const contentW = PAGE_W - MARGIN * 2;
  const topMargin = 10;
  const headerH = 44;
  const headerTop = PAGE_H - topMargin;
  const headerBottom = headerTop - headerH;
  const logoMaxH = headerH * 0.7;
  const logoMaxW = contentW * 0.5;
  let brandBottomY = headerBottom;

  let logoDrawn = false;
  if (brandId && brandId !== "casher") {
    try {
      const logo = await getBrandSiteLogo(brandId);
      const logoImage = await pdf.embedPng(logo.png);
      const scale = Math.min(logoMaxW / logoImage.width, logoMaxH / logoImage.height, 1.35);
      const logoW = logoImage.width * scale;
      const logoH = logoImage.height * scale;
      const logoY = headerBottom + (headerH - logoH) / 2;
      page.drawImage(logoImage, {
        x: (PAGE_W - logoW) / 2,
        y: logoY,
        width: logoW,
        height: logoH,
      });
      brandBottomY = headerBottom;
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }

  if (!logoDrawn) {
    const brandSize = 15;
    const brandY = headerBottom + (headerH - brandSize) / 2;
    drawCenteredText(page, bold, brand, brandSize, brandY);
    brandBottomY = headerBottom;
  }

  const ruleY = brandBottomY - 1;
  page.drawRectangle({
    x: MARGIN,
    y: ruleY,
    width: PAGE_W - MARGIN * 2,
    height: 1.1,
    color: BLACK,
  });

  const contentTop = ruleY - 6;
  const contentBottom = MARGIN;
  const contentH = contentTop - contentBottom;
  const gap = 6;
  const leftW = Math.round((PAGE_W - MARGIN * 2 - gap) * 0.48);
  const rightW = PAGE_W - MARGIN * 2 - gap - leftW;
  const leftX = MARGIN;
  const rightX = MARGIN + leftW + gap;

  // ── Левая колонка: трек + QR/ЧЗ ──
  drawZoneFrame(page, leftX, contentBottom, leftW, contentH);
  drawZoneTitle(page, bold, "Трек", leftX, contentTop);

  const pad = 8;
  const barcodeH = 42;
  const barcodeY = contentTop - 14 - barcodeH;
  try {
    void code128ModuleCount(track);
    drawCode128(page, track, leftX + pad, barcodeY, leftW - pad * 2, barcodeH);
  } catch {
    page.drawRectangle({
      x: leftX + pad,
      y: barcodeY,
      width: leftW - pad * 2,
      height: barcodeH,
      borderColor: BLACK,
      borderWidth: 1,
    });
  }

  const trackSize = track.length > 14 ? 11 : 13;
  drawCenteredIn(page, bold, track, trackSize, barcodeY - 15, leftX, leftW);
  const belowY = barcodeY - 18;

  const qrTop = belowY - 4;
  const qrBottom = contentBottom + pad;
  const qrH = Math.max(48, qrTop - qrBottom);
  const czItems = input.items.filter((item) => Boolean(item.chestnyZnak?.trim()));
  const hasCz = czItems.length > 0;

  // внутренняя рамка сайта/чз
  page.drawRectangle({
    x: leftX + pad,
    y: qrBottom,
    width: leftW - pad * 2,
    height: qrH,
    borderColor: BLACK,
    borderWidth: 0.8,
  });
  drawZoneTitle(page, bold, hasCz ? "Честные знаки" : "Сайт", leftX + pad, qrTop);

  const inner = 6;
  const usableW = leftW - pad * 2 - inner * 2;
  const usableH = qrH - 16;
  const areaX = leftX + pad + inner;
  const areaY = qrBottom + inner;

  if (hasCz) {
    const codes = [...new Set(czItems.map((i) => i.chestnyZnak!.trim()))].slice(0, 3);
    const qrs = await Promise.all(codes.map((code) => embedQrPng(pdf, code, 180)));
    const n = qrs.length;
    const cell = Math.min(usableH, (usableW - 4 * (n - 1)) / n);
    let qx = areaX + Math.max(0, (usableW - (n * cell + 4 * (n - 1))) / 2);
    const qy = areaY + Math.max(0, (usableH - cell) / 2);
    for (let i = 0; i < n; i++) {
      page.drawImage(qrs[i], { x: qx, y: qy, width: cell, height: cell });
      qx += cell + 4;
    }
  } else {
    const site = brandSiteUrl(input.brand);
    const qr = await embedQrPng(pdf, site, 280);
    const qrSize = Math.min(usableW, usableH - 10);
    const qx = areaX + (usableW - qrSize) / 2;
    const qy = areaY + 10;
    page.drawImage(qr, { x: qx, y: qy, width: qrSize, height: qrSize });
    const host = site.replace(/^https?:\/\//, "");
    const hw = bold.widthOfTextAtSize(host, 7);
    page.drawText(host, {
      x: areaX + (usableW - hw) / 2,
      y: areaY + 1,
      size: 7,
      font: bold,
      color: BLACK,
    });
  }

  // ── Правая колонка: доп. инфо + картинки ──
  drawZoneFrame(page, rightX, contentBottom, rightW, contentH);
  drawZoneTitle(page, bold, "Доп. инфо", rightX, contentTop);

  const infoPad = 7;
  let y = contentTop - 15;
  const textW = rightW - infoPad * 2;

  for (const line of wrapLines(bold, `Заказ № ${orderNo}`, 11, textW, 2)) {
    page.drawText(line, { x: rightX + infoPad, y, size: 11, font: bold, color: BLACK });
    y -= 12;
  }

  if (input.city?.trim()) {
    for (const line of wrapLines(font, input.city.trim(), 9, textW, 1)) {
      page.drawText(line, { x: rightX + infoPad, y, size: 9, font, color: BLACK });
      y -= 11;
    }
  }

  if (input.customerName?.trim()) {
    for (const line of wrapLines(bold, input.customerName.trim(), 9, textW, 2)) {
      page.drawText(line, { x: rightX + infoPad, y, size: 9, font: bold, color: BLACK });
      y -= 11;
    }
  }

  page.drawRectangle({
    x: rightX + infoPad,
    y: y + 3,
    width: textW,
    height: 0.7,
    color: BLACK,
  });
  y -= 4;

  const items = input.items.slice(0, 4);
  const images = await Promise.all(items.map((item) => embedProductImage(pdf, item.imageUrl)));
  const avail = y - contentBottom - 6;
  const rowH = Math.min(56, Math.max(34, avail / Math.max(items.length, 1)));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const img = images[i];
    const rowBottom = y - rowH;
    if (rowBottom < contentBottom + 3) break;

    const thumb = Math.min(rowH - 4, 48);
    const thumbX = rightX + infoPad;
    const thumbY = rowBottom + (rowH - thumb) / 2;

    page.drawRectangle({
      x: thumbX,
      y: thumbY,
      width: thumb,
      height: thumb,
      borderColor: BLACK,
      borderWidth: 0.7,
      color: WHITE,
    });

    if (img) {
      const scale = Math.min(thumb / img.width, thumb / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      page.drawImage(img, {
        x: thumbX + (thumb - dw) / 2,
        y: thumbY + (thumb - dh) / 2,
        width: dw,
        height: dh,
      });
    }

    const textX = thumbX + thumb + 5;
    const nameMax = rightX + rightW - infoPad - textX;
    const nameLines = wrapLines(bold, item.productName, 9, nameMax, 2);
    let ty = thumbY + thumb - 10;
    for (const line of nameLines) {
      page.drawText(line, { x: textX, y: ty, size: 9, font: bold, color: BLACK });
      ty -= 10;
    }
    page.drawText(`${item.size || "—"}  ·  ×${item.quantity}`, {
      x: textX,
      y: thumbY + 3,
      size: 9,
      font: bold,
      color: BLACK,
    });

    y = rowBottom - 2;
  }

  if (input.items.length > items.length) {
    page.drawText(`+ ещё ${input.items.length - items.length}`, {
      x: rightX + infoPad,
      y: contentBottom + 3,
      size: 8,
      font: bold,
      color: BLACK,
    });
  }

  return Buffer.from(await pdf.save());
}
