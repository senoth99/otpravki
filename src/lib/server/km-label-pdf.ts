import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import bwipjs from "bwip-js";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { type BoxLabelBrandId } from "@/lib/box-label-brands";
import { mmToPoints } from "@/lib/label-media";
import { getBrandSiteLogo } from "@/lib/server/brand-site-logo";

/** Этикетка ЧЗ на WS408: 60×55 мм. */
export const KM_LABEL_WIDTH_MM = 60;
export const KM_LABEL_HEIGHT_MM = 55;

const PAGE_W = mmToPoints(KM_LABEL_WIDTH_MM);
const PAGE_H = mmToPoints(KM_LABEL_HEIGHT_MM);
const MARGIN = 4;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

/** Data Matrix ~20 мм — не перекрывает текст. */
const DM_MAX_MM = 20;

export type KmLabelInput = {
  cis: string;
  gtin?: string;
  /** Название вещи */
  productName?: string;
  brandId?: BoxLabelBrandId;
  title?: string;
};

type CisFields = {
  gtin: string;
  serial: string;
  key91: string;
  crypto92: string;
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

function parseCisFields(cis: string, gtinFallback?: string): CisFields {
  const parts = cis.split("\u001d");
  const head = parts[0] ?? "";
  let gtin = gtinFallback?.trim() ?? "";
  let serial = "";
  if (head.startsWith("01") && head.length >= 16) {
    gtin = gtin || head.slice(2, 16);
    if (head.includes("21")) serial = head.slice(head.indexOf("21") + 2);
  }
  let key91 = "";
  let crypto92 = "";
  for (const part of parts.slice(1)) {
    if (part.startsWith("91")) key91 = part.slice(2);
    if (part.startsWith("92")) crypto92 = part.slice(2);
  }
  return { gtin, serial, key91, crypto92 };
}

function wrapLine(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  if (!text) return [];
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];

  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    const test = current + ch;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapWords(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  if (!text.trim()) return [];
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      lines.push(...wrapLine(font, word, size, maxWidth));
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Сэмпл КМ для тест-печати (не из ЦРПТ). */
export function buildSampleKmCis(): KmLabelInput {
  const gtin = "04604341401012";
  const serial = `T${Date.now().toString(36).toUpperCase().slice(-10)}`;
  const cis = [
    `01${gtin}`,
    `21${serial}`,
    "\u001d",
    "91EE06",
    "\u001d",
    "92dGVzdFNpZ25hdHVyZUNoZXN0bnlZbmFrVGVzdA==",
  ].join("");
  return {
    cis,
    gtin,
    productName: "Футболка Oversize Black / M",
    brandId: "casher",
  };
}

function toGs1ParenForm(cis: string): string | null {
  const parts = cis.split("\u001d");
  const head = parts[0] ?? "";
  if (!head.startsWith("01") || head.length < 18 || !head.includes("21")) return null;
  const gtin = head.slice(2, 16);
  const serial = head.slice(18);
  if (!/^\d{14}$/.test(gtin) || !serial) return null;
  let out = `(01)${gtin}(21)${serial}`;
  for (const part of parts.slice(1)) {
    if (part.startsWith("91") && part.length > 2) out += `(91)${part.slice(2)}`;
    else if (part.startsWith("92") && part.length > 2) out += `(92)${part.slice(2)}`;
    else return null;
  }
  return out;
}

async function renderDataMatrixPng(cis: string): Promise<Buffer> {
  const opts = {
    scale: 2,
    includetext: false as const,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  };
  const gs1 = toGs1ParenForm(cis);
  if (gs1) {
    try {
      return await bwipjs.toBuffer({ bcid: "gs1datamatrix", text: gs1, ...opts });
    } catch {
      // fallback
    }
  }
  return bwipjs.toBuffer({ bcid: "datamatrix", text: cis, ...opts });
}

async function prepareLogoPng(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .ensureAlpha()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .greyscale()
    .normalize()
    .linear(1.6, -40)
    .threshold(200)
    .png()
    .toBuffer();
}

function drawLeftLines(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  size: number,
  lineHeight: number,
  x: number,
  topY: number,
): number {
  let y = topY;
  for (const line of lines) {
    page.drawText(line, { x, y: y - size, size, font, color: BLACK });
    y -= lineHeight;
  }
  return y;
}

export async function buildKmLabelPdf(input: KmLabelInput): Promise<Buffer> {
  const cis = input.cis.trim();
  if (!cis) throw new Error("Пустой код маркировки");

  const fields = parseCisFields(cis, input.gtin);
  const productName = input.productName?.trim() || input.title?.trim() || "Товар";
  const brandId = input.brandId ?? "casher";

  const [dmPng, monoBytes, logoEntry] = await Promise.all([
    renderDataMatrixPng(cis),
    readFile(resolveFont("DejaVuSansMono.ttf")),
    getBrandSiteLogo(brandId).catch(() => null),
  ]);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const mono = await pdf.embedFont(monoBytes, { subset: true });
  const dm = await pdf.embedPng(dmPng);

  let cursorY = PAGE_H - MARGIN;

  // 1) Лого бренда сверху
  let logo: PDFImage | null = null;
  if (logoEntry) {
    try {
      const logoPng = await prepareLogoPng(logoEntry.png);
      logo = await pdf.embedPng(logoPng);
    } catch {
      logo = null;
    }
  }
  if (logo) {
    const logoMaxW = PAGE_W - MARGIN * 2;
    const logoMaxH = mmToPoints(7);
    const scale = Math.min(logoMaxW / logo.width, logoMaxH / logo.height, 1);
    const logoW = logo.width * scale;
    const logoH = logo.height * scale;
    cursorY -= logoH;
    page.drawImage(logo, {
      x: (PAGE_W - logoW) / 2,
      y: cursorY,
      width: logoW,
      height: logoH,
    });
    cursorY -= 3;
  } else {
    const brandLabel = brandId.toUpperCase();
    const size = 8;
    const tw = mono.widthOfTextAtSize(brandLabel, size);
    cursorY -= size + 2;
    page.drawText(brandLabel, {
      x: (PAGE_W - tw) / 2,
      y: cursorY,
      size,
      font: mono,
      color: BLACK,
    });
    cursorY -= 3;
  }

  // 2) Компактный Data Matrix по центру
  const dmMax = mmToPoints(DM_MAX_MM);
  const dmScale = Math.min(dmMax / dm.width, dmMax / dm.height);
  const dmW = dm.width * dmScale;
  const dmH = dm.height * dmScale;
  cursorY -= dmH;
  page.drawImage(dm, {
    x: (PAGE_W - dmW) / 2,
    y: cursorY,
    width: dmW,
    height: dmH,
  });
  cursorY -= 4;

  // 3) Текст слева: название + поля ЧЗ с переносом
  const textWidth = PAGE_W - MARGIN * 2;
  const nameSize = 6.5;
  const metaSize = 5.5;
  const nameLines = wrapWords(mono, productName, nameSize, textWidth);
  const metaLines: string[] = [];
  if (fields.gtin) metaLines.push(...wrapLine(mono, `GTIN ${fields.gtin}`, metaSize, textWidth));
  if (fields.serial) metaLines.push(...wrapLine(mono, `S/N  ${fields.serial}`, metaSize, textWidth));
  if (fields.key91) metaLines.push(...wrapLine(mono, `91   ${fields.key91}`, metaSize, textWidth));
  if (fields.crypto92) {
    metaLines.push(...wrapLine(mono, `92   ${fields.crypto92}`, metaSize, textWidth));
  }

  const nameLH = nameSize * 1.2;
  const metaLH = metaSize * 1.18;
  const needed =
    nameLines.length * nameLH + (nameLines.length && metaLines.length ? 2 : 0) + metaLines.length * metaLH;
  const available = cursorY - MARGIN;
  // если не влезает — чуть ужимаем meta, название оставляем
  let metaSizeUse = metaSize;
  let metaLHUse = metaLH;
  if (needed > available && available > 20) {
    const scale = Math.max(0.85, available / needed);
    metaSizeUse = metaSize * scale;
    metaLHUse = metaSizeUse * 1.18;
  }

  cursorY = drawLeftLines(page, mono, nameLines, nameSize, nameLH, MARGIN, cursorY);
  if (nameLines.length && metaLines.length) cursorY -= 2;
  drawLeftLines(page, mono, metaLines, metaSizeUse, metaLHUse, MARGIN, cursorY);

  return Buffer.from(await pdf.save());
}
