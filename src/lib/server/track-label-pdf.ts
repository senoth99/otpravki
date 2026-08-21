import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { code128ModuleCount, encodeCode128B } from "@/lib/server/code128";
import { externalFetch } from "@/lib/server/external-fetch";
import { labelHeightPoints, labelWidthPoints } from "@/lib/label-media";
import type { ShippingOrder, ShippingOrderItem } from "@/types/shipping";

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

const YANDEX_MEDIA = "https://amarix-media.storage.yandexcloud.net";
const STOREFRONT =
  process.env.PRODUCT_IMAGE_PROXY_ORIGIN?.replace(/\/$/, "") ?? "https://cashercollection.com";

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
  if (!lower) return true; // дефолт бренда приложения
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
        // слово не влезло — обрежем последнюю строку ниже
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
  pageW: number,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (pageW - width) / 2,
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

function remoteCandidates(imageUrl?: string): string[] {
  if (!imageUrl) return [];
  const out: string[] = [];
  const add = (url: string) => {
    if (url && !out.includes(url)) out.push(url);
  };

  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    add(imageUrl);
    add(`${STOREFRONT}/_next/image?url=${encodeURIComponent(imageUrl)}&w=256&q=70`);
    return out;
  }

  if (imageUrl.startsWith("/api/images/yc/")) {
    const remote = `${YANDEX_MEDIA}/${imageUrl.slice("/api/images/yc/".length)}`;
    add(remote);
    add(`${STOREFRONT}/_next/image?url=${encodeURIComponent(remote)}&w=256&q=70`);
    return out;
  }

  if (imageUrl.startsWith("/api/images/")) {
    const rest = imageUrl.slice("/api/images/".length);
    const base = (process.env.PRODUCTS_API_URL ?? "https://api.cashercollection.com").replace(/\/$/, "");
    add(`${base}/${rest}`);
  }

  return out;
}

function isJpeg(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

async function fetchImageBytes(imageUrl?: string): Promise<Uint8Array | null> {
  for (const remote of remoteCandidates(imageUrl)) {
    try {
      const res = await externalFetch(remote, { timeoutMs: 8_000 });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64) continue;
      // jpeg/png — как есть; webp и прочее — в ч/б png через sharp
      if (isJpeg(buf) || isPng(buf)) return new Uint8Array(buf);
      try {
        const png = await sharp(buf)
          .rotate()
          .resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true })
          .grayscale()
          .png({ compressionLevel: 9 })
          .toBuffer();
        if (png.length > 64) return new Uint8Array(png);
      } catch {
        // next
      }
    } catch {
      // next candidate
    }
  }
  return null;
}

async function embedProductImage(pdf: PDFDocument, imageUrl?: string): Promise<PDFImage | null> {
  const bytes = await fetchImageBytes(imageUrl);
  if (!bytes) return null;
  try {
    if (isJpeg(Buffer.from(bytes))) return await pdf.embedJpg(bytes);
    if (isPng(Buffer.from(bytes))) return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
  return null;
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

export function sampleTrackLabelInput(): TrackLabelInput {
  return {
    brand: "CASHER",
    orderNumber: "бв19",
    trackingNumber: "10300912367",
    city: "Москва",
    customerName: "Иванов Иван Иванович",
    items: [
      {
        productName: "ШТАНЫ LIGHT CLASSIC",
        size: "S",
        quantity: 1,
        chestnyZnak: null,
      },
    ],
  };
}

function drawCentered(
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

/** Портрет 100×150 мм под TSC TE300 — без альбомных полей. */
export async function buildTrackLabelPdf(input: TrackLabelInput): Promise<Buffer> {
  const pageW = labelWidthPoints();
  const pageH = labelHeightPoints();
  const margin = 4;
  const casher = isCasherBrand(input.brand);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([pageW, pageH]);

  const [regularBytes, boldBytes] = await Promise.all([
    readFile(resolveFont("DejaVuSans.ttf")),
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
  ]);
  const font = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });

  page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: WHITE });

  const brand = brandDisplayName(input.brand);
  const brandSize = casher ? 22 : 20;
  const brandY = pageH - margin - brandSize;
  drawCenteredText(page, bold, brand, brandSize, brandY, pageW);

  const ruleY = brandY - 5;
  page.drawRectangle({
    x: margin,
    y: ruleY,
    width: pageW - margin * 2,
    height: 1.2,
    color: BLACK,
  });

  let cursor = ruleY - 6;
  const contentW = pageW - margin * 2;
  const leftX = margin;
  const track = input.trackingNumber.replace(/\s+/g, "");
  const orderNo = input.orderNumber.trim();

  if (casher) {
    // Центр как в образце 4.pdf: штрих → трек → номер заказа
    const blockH = 108;
    const blockTop = cursor;
    const blockBottom = cursor - blockH;
    drawZoneFrame(page, leftX, blockBottom, contentW, blockH);
    drawZoneTitle(page, bold, "Трек", leftX, blockTop);

    const padX = 10;
    const barcodeH = 52;
    const barcodeW = contentW - padX * 2;
    const barcodeY = blockTop - 14 - barcodeH;
    try {
      void code128ModuleCount(track);
      drawCode128(page, track, leftX + padX, barcodeY, barcodeW, barcodeH);
    } catch {
      page.drawRectangle({
        x: leftX + padX,
        y: barcodeY,
        width: barcodeW,
        height: barcodeH,
        borderColor: BLACK,
        borderWidth: 1,
      });
    }

    const trackSize = track.length > 14 ? 13 : 15;
    drawCentered(page, bold, track, trackSize, barcodeY - 18, leftX, contentW);

    const orderSize = orderNo.length > 18 ? 11 : 13;
    drawCentered(page, bold, orderNo, orderSize, barcodeY - 36, leftX, contentW);
    cursor = blockBottom - 6;
  } else {
    const barcodeH = 44;
    const barcodeY = cursor - barcodeH;
    try {
      void code128ModuleCount(track);
      drawCode128(page, track, leftX, barcodeY, contentW, barcodeH);
    } catch {
      page.drawRectangle({
        x: leftX,
        y: barcodeY,
        width: contentW,
        height: barcodeH,
        borderColor: BLACK,
        borderWidth: 1,
      });
    }

    const trackSize = 12;
    drawCentered(page, bold, track, trackSize, barcodeY - 14, leftX, contentW);
    cursor = barcodeY - 20;
  }

  const czItems = input.items.filter((item) => Boolean(item.chestnyZnak?.trim()));
  const hasCz = czItems.length > 0;
  const qrBlockH = casher ? 64 : 72;
  const qrTop = cursor;
  const qrBottom = cursor - qrBlockH;
  drawZoneFrame(page, leftX, qrBottom, contentW, qrBlockH);
  drawZoneTitle(page, bold, hasCz ? "Честные знаки" : "Сайт", leftX, qrTop);

  const innerPad = 8;
  if (hasCz) {
    const codes = [...new Set(czItems.map((i) => i.chestnyZnak!.trim()))].slice(0, 4);
    const qrs = await Promise.all(codes.map((code) => embedQrPng(pdf, code, 200)));
    const n = qrs.length;
    const gap = 6;
    const cell = Math.min(qrBlockH - 22, (contentW - innerPad * 2 - gap * (n - 1)) / n);
    let qx = leftX + innerPad + Math.max(0, (contentW - innerPad * 2 - (n * cell + gap * (n - 1))) / 2);
    const qy = qrBottom + 12;
    for (let i = 0; i < n; i++) {
      page.drawImage(qrs[i], { x: qx, y: qy, width: cell, height: cell });
      qx += cell + gap;
    }
  } else {
    const site = brandSiteUrl(input.brand);
    const qr = await embedQrPng(pdf, site, 320);
    const qrSize = Math.min(contentW - innerPad * 2, qrBlockH - 20);
    const qx = leftX + (contentW - qrSize) / 2;
    const qy = qrBottom + 12;
    page.drawImage(qr, { x: qx, y: qy, width: qrSize, height: qrSize });
    const host = site.replace(/^https?:\/\//, "");
    const hw = bold.widthOfTextAtSize(host, 8);
    page.drawText(host, {
      x: leftX + (contentW - hw) / 2,
      y: qrBottom + 3,
      size: 8,
      font: bold,
      color: BLACK,
    });
  }

  cursor = qrBottom - 6;
  const infoBottom = margin;
  const infoH = cursor - infoBottom;
  drawZoneFrame(page, leftX, infoBottom, contentW, infoH);
  drawZoneTitle(page, bold, "Доп. инфо", leftX, cursor);

  const infoPad = 7;
  let y = cursor - 16;
  const textW = contentW - infoPad * 2;

  // У Casher номер заказа уже в центре — в доп.инфо не дублируем
  if (!casher) {
    const orderLines = wrapLines(bold, `Заказ № ${input.orderNumber}`, 11, textW, 2);
    for (const line of orderLines) {
      page.drawText(line, { x: leftX + infoPad, y, size: 11, font: bold, color: BLACK });
      y -= 13;
    }
  }

  if (input.city?.trim()) {
    for (const line of wrapLines(font, input.city.trim(), 10, textW, 1)) {
      page.drawText(line, { x: leftX + infoPad, y, size: 10, font, color: BLACK });
      y -= 12;
    }
  }

  if (input.customerName?.trim()) {
    for (const line of wrapLines(bold, input.customerName.trim(), 10, textW, 2)) {
      page.drawText(line, { x: leftX + infoPad, y, size: 10, font: bold, color: BLACK });
      y -= 12;
    }
  }

  page.drawRectangle({
    x: leftX + infoPad,
    y: y + 4,
    width: textW,
    height: 0.8,
    color: BLACK,
  });
  y -= 4;

  const items = input.items.slice(0, 5);
  const images = await Promise.all(items.map((item) => embedProductImage(pdf, item.imageUrl)));
  const avail = y - infoBottom - 6;
  const rowH = Math.min(72, Math.max(36, avail / Math.max(items.length, 1)));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const img = images[i];
    const rowBottom = y - rowH;
    if (rowBottom < infoBottom + 4) break;

    const thumb = Math.min(rowH - 4, 56);
    const thumbX = leftX + infoPad;
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
    const nameMax = leftX + contentW - infoPad - textX;
    const nameLines = wrapLines(bold, item.productName, 10, nameMax, 2);
    let ty = thumbY + thumb - 11;
    for (const line of nameLines) {
      page.drawText(line, { x: textX, y: ty, size: 10, font: bold, color: BLACK });
      ty -= 11;
    }
    page.drawText(`${item.size || "—"}  ·  ×${item.quantity}`, {
      x: textX,
      y: thumbY + 4,
      size: 10,
      font: bold,
      color: BLACK,
    });

    y = rowBottom - 2;
  }

  if (input.items.length > items.length) {
    page.drawText(`+ ещё ${input.items.length - items.length}`, {
      x: leftX + infoPad,
      y: infoBottom + 3,
      size: 9,
      font: bold,
      color: BLACK,
    });
  }

  return Buffer.from(await pdf.save());
}
