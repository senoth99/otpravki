import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { code128ModuleCount, encodeCode128B } from "@/lib/server/code128";
import { externalFetch } from "@/lib/server/external-fetch";
import type { ShippingOrder, ShippingOrderItem } from "@/types/shipping";

/** 4×6 landscape (дюймы) в пунктах PDF */
const PAGE_W = 6 * 72;
const PAGE_H = 4 * 72;
const MARGIN = 10;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.22, 0.22, 0.22);

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

export function brandDisplayName(brand?: string): string {
  const value = (brand ?? "").trim();
  if (!value) return "CASHER";
  const lower = value.toLowerCase();
  if (lower === "ammo" || lower === "ammd" || lower.includes("ammo") || lower.includes("ammd")) {
    return "AMMO";
  }
  if (lower.includes("кураж") || lower.includes("kurazh")) return "КУРАЖ";
  if (lower.includes("casher") || lower.includes("кэшер") || lower.includes("кешер")) {
    return "CASHER";
  }
  return value.toUpperCase();
}

/** Сайт бренда для QR, если в заказе нет честных знаков */
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

function truncate(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  y: number,
  color = BLACK,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_W - width) / 2,
    y,
    size,
    font,
    color,
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
        width: Math.max(0.4, span),
        height,
        color: BLACK,
      });
    }
    cursor += span;
    bar = !bar;
  }
}

function remoteImageUrlFromLocal(imageUrl: string): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  if (imageUrl.startsWith("/api/images/yc/")) {
    return `https://amarix-media.storage.yandexcloud.net/${imageUrl.slice("/api/images/yc/".length)}`;
  }
  if (imageUrl.startsWith("/api/images/uploads/")) {
    const base = (process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com").replace(/\/$/, "");
    return `${base}/${imageUrl.slice("/api/images/".length)}`;
  }
  return null;
}

async function fetchImageBytes(imageUrl?: string): Promise<Uint8Array | null> {
  if (!imageUrl) return null;
  const remote = remoteImageUrlFromLocal(imageUrl);
  if (!remote) return null;
  try {
    const res = await externalFetch(remote, { timeoutMs: 8_000 });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function embedProductImage(
  pdf: PDFDocument,
  imageUrl?: string,
): Promise<PDFImage | null> {
  const bytes = await fetchImageBytes(imageUrl);
  if (!bytes) return null;
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return await pdf.embedJpg(bytes);
    }
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

async function embedQrPng(pdf: PDFDocument, payload: string, px = 280): Promise<PDFImage> {
  const buf = await QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: px,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return pdf.embedPng(buf);
}

function drawZoneFrame(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: BLACK,
    borderWidth: 1.4,
    color: WHITE,
  });
}

function drawZoneTitle(
  page: PDFPage,
  font: PDFFont,
  title: string,
  x: number,
  top: number,
) {
  const size = 9;
  const pad = 4;
  const tw = font.widthOfTextAtSize(title, size);
  page.drawRectangle({
    x: x + 8,
    y: top - size / 2 - 1,
    width: tw + pad * 2,
    height: size + 3,
    color: WHITE,
  });
  page.drawText(title, {
    x: x + 8 + pad,
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

export function sampleTrackLabelInput(): TrackLabelInput {
  return {
    brand: "AMMO",
    orderNumber: "бв19",
    trackingNumber: "10300912367",
    city: "Москва",
    customerName: "Тест",
    items: [
      { productName: "Футболка Classic", size: "M", quantity: 2, chestnyZnak: null },
      { productName: "Худи Oversized", size: "L", quantity: 1, chestnyZnak: null },
      { productName: "Носки комплект", size: "ONE", quantity: 3, chestnyZnak: null },
    ],
  };
}

export async function buildTrackLabelPdf(input: TrackLabelInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const [regularBytes, boldBytes] = await Promise.all([
    readFile(resolveFont("DejaVuSans.ttf")),
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
  ]);
  const font = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });

  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const brand = brandDisplayName(input.brand);
  const brandSize = brand.length > 10 ? 22 : brand.length > 6 ? 26 : 30;
  const brandY = PAGE_H - MARGIN - brandSize;
  drawCenteredText(page, bold, brand, brandSize, brandY);

  const ruleY = brandY - 8;
  page.drawRectangle({
    x: MARGIN,
    y: ruleY,
    width: PAGE_W - MARGIN * 2,
    height: 1.4,
    color: BLACK,
  });

  const contentTop = ruleY - 10;
  const contentBottom = MARGIN;
  const contentH = contentTop - contentBottom;
  const gap = 8;
  const leftW = (PAGE_W - MARGIN * 2 - gap) / 2;
  const rightW = leftW;
  const leftX = MARGIN;
  const rightX = MARGIN + leftW + gap;

  const track = input.trackingNumber.replace(/\s+/g, "");
  const barcodeH = 48;
  const barcodeW = leftW - 4;
  const barcodeY = contentTop - barcodeH;
  try {
    void code128ModuleCount(track);
    drawCode128(page, track, leftX + 2, barcodeY, barcodeW, barcodeH);
  } catch {
    page.drawRectangle({
      x: leftX + 2,
      y: barcodeY,
      width: barcodeW,
      height: barcodeH,
      borderColor: BLACK,
      borderWidth: 1,
    });
  }

  const trackSize = track.length > 16 ? 11 : 13;
  const trackLabel = truncate(bold, track, trackSize, leftW - 4);
  const trackTextW = bold.widthOfTextAtSize(trackLabel, trackSize);
  page.drawText(trackLabel, {
    x: leftX + (leftW - trackTextW) / 2,
    y: barcodeY - 16,
    size: trackSize,
    font: bold,
    color: BLACK,
  });

  const czTop = barcodeY - 24;
  const czBottom = contentBottom;
  const czH = Math.max(56, czTop - czBottom);
  const czItems = input.items.filter((item) => Boolean(item.chestnyZnak?.trim()));
  const hasCz = czItems.length > 0;
  const zoneTitle = hasCz ? "Честные знаки" : "Сайт";
  drawZoneFrame(page, leftX, czBottom, leftW, czH);
  drawZoneTitle(page, bold, zoneTitle, leftX, czTop);

  const innerPad = 10;
  const usableW = leftW - innerPad * 2;
  const usableH = czH - 18;
  const areaX = leftX + innerPad;
  const areaY = czBottom + innerPad;

  if (hasCz) {
    // Одна зона: QR по каждому ЧЗ / GTIN
    const codes = czItems
      .map((item) => item.chestnyZnak?.trim())
      .filter((code): code is string => Boolean(code));
    const unique = [...new Set(codes)].slice(0, 4);
    const qrImages = await Promise.all(unique.map((code) => embedQrPng(pdf, code, 220)));
    const n = qrImages.length;
    const gapQr = 6;
    const cell = Math.min(
      usableH - 14,
      (usableW - gapQr * Math.max(n - 1, 0)) / Math.max(n, 1),
    );
    const totalW = n * cell + gapQr * Math.max(n - 1, 0);
    let qx = areaX + Math.max(0, (usableW - totalW) / 2);
    const qy = areaY + 12;
    for (let i = 0; i < n; i++) {
      const img = qrImages[i];
      page.drawImage(img, { x: qx, y: qy, width: cell, height: cell });
      const short = truncate(font, unique[i], 7, cell);
      const sw = font.widthOfTextAtSize(short, 7);
      page.drawText(short, {
        x: qx + (cell - sw) / 2,
        y: areaY + 2,
        size: 7,
        font,
        color: BLACK,
      });
      qx += cell + gapQr;
    }
  } else {
    const site = brandSiteUrl(input.brand);
    const qr = await embedQrPng(pdf, site, 360);
    const qrSize = Math.min(usableW, usableH - 16);
    const qx = areaX + (usableW - qrSize) / 2;
    const qy = areaY + 14;
    page.drawImage(qr, { x: qx, y: qy, width: qrSize, height: qrSize });
    const host = site.replace(/^https?:\/\//, "");
    const hostSize = 9;
    const hostText = truncate(bold, host, hostSize, usableW);
    const hw = bold.widthOfTextAtSize(hostText, hostSize);
    page.drawText(hostText, {
      x: areaX + (usableW - hw) / 2,
      y: areaY + 2,
      size: hostSize,
      font: bold,
      color: BLACK,
    });
  }

  // ── Правая колонка: доп. инфо ──
  drawZoneFrame(page, rightX, contentBottom, rightW, contentH);
  drawZoneTitle(page, bold, "Доп. инфо", rightX, contentTop);

  let cursorY = contentTop - 18;
  const infoPad = 8;
  const orderSize = 13;
  const orderLine = `Заказ № ${input.orderNumber}`;
  page.drawText(truncate(bold, orderLine, orderSize, rightW - infoPad * 2), {
    x: rightX + infoPad,
    y: cursorY,
    size: orderSize,
    font: bold,
    color: BLACK,
  });
  cursorY -= 15;

  const meta: string[] = [];
  if (input.city?.trim()) meta.push(input.city.trim());
  if (input.customerName?.trim()) meta.push(input.customerName.trim());
  if (meta.length) {
    page.drawText(truncate(font, meta.join(" · "), 10, rightW - infoPad * 2), {
      x: rightX + infoPad,
      y: cursorY,
      size: 10,
      font,
      color: BLACK,
    });
    cursorY -= 12;
  }

  page.drawRectangle({
    x: rightX + infoPad,
    y: cursorY + 2,
    width: rightW - infoPad * 2,
    height: 0.9,
    color: BLACK,
  });
  cursorY -= 8;

  const maxItems = 6;
  const items = input.items.slice(0, maxItems);
  const rowH = Math.min(40, Math.max(28, (cursorY - contentBottom - 10) / Math.max(items.length, 1)));

  const images = await Promise.all(
    items.map((item) => embedProductImage(pdf, item.imageUrl)),
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const img = images[i];
    const rowBottom = cursorY - rowH;
    if (rowBottom < contentBottom + 4) break;

    const thumb = Math.min(rowH - 4, 32);
    const thumbX = rightX + infoPad;
    const thumbY = rowBottom + (rowH - thumb) / 2;

    page.drawRectangle({
      x: thumbX,
      y: thumbY,
      width: thumb,
      height: thumb,
      borderColor: BLACK,
      borderWidth: 0.8,
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

    const textX = thumbX + thumb + 6;
    const textMax = rightX + rightW - infoPad - textX;
    const nameSize = 10;
    const name = truncate(bold, item.productName, nameSize, textMax);
    page.drawText(name, {
      x: textX,
      y: thumbY + thumb - 12,
      size: nameSize,
      font: bold,
      color: BLACK,
    });

    const detailSize = 10;
    const detail = truncate(
      bold,
      `${item.size || "—"}  ·  ×${item.quantity}`,
      detailSize,
      textMax,
    );
    page.drawText(detail, {
      x: textX,
      y: thumbY + 4,
      size: detailSize,
      font: bold,
      color: BLACK,
    });

    cursorY = rowBottom - 2;
  }

  if (input.items.length > maxItems) {
    const more = `+ ещё ${input.items.length - maxItems}`;
    page.drawText(more, {
      x: rightX + infoPad,
      y: contentBottom + 4,
      size: 9,
      font: bold,
      color: BLACK,
    });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
