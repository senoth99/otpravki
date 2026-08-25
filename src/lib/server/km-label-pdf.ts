import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import bwipjs from "bwip-js";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { getBoxLabelBrand, type BoxLabelBrandId } from "@/lib/box-label-brands";
import { mmToPoints } from "@/lib/label-media";
import { getBrandSiteLogo } from "@/lib/server/brand-site-logo";

/** Этикетка ЧЗ на WS408: 60×55 мм. */
export const KM_LABEL_WIDTH_MM = 60;
export const KM_LABEL_HEIGHT_MM = 55;

const PAGE_W = mmToPoints(KM_LABEL_WIDTH_MM);
const PAGE_H = mmToPoints(KM_LABEL_HEIGHT_MM);
const MX = 5;
const MT = 7;
const MB = 5;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.25, 0.25, 0.25);

export type KmLabelInput = {
  cis: string;
  gtin?: string;
  productName?: string;
  brandId?: BoxLabelBrandId;
  title?: string;
  size?: string;
};

type CisFields = {
  gtin: string;
  serial: string;
  key91: string;
  crypto92: string;
};

const SAMPLE_PRODUCTS: Record<BoxLabelBrandId, { name: string; size: string }> = {
  casher: { name: "Футболка Oversize Black", size: "M" },
  kurazh: { name: "Худи Classic Grey", size: "L" },
  ammo: { name: "Кепка Logo Cap", size: "ONE" },
  shecash: { name: "Сумка Mini Cross", size: "—" },
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
    if (font.widthOfTextAtSize(test, size) <= maxWidth) current = test;
    else {
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
    if (font.widthOfTextAtSize(word, size) <= maxWidth) current = word;
    else {
      lines.push(...wrapLine(font, word, size, maxWidth));
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Сэмпл КМ для тест-печати под выбранный бренд. */
export function buildSampleKmCis(brandId: BoxLabelBrandId = "casher"): KmLabelInput {
  const gtin = "04604341401012";
  const serial = `T${Date.now().toString(36).toUpperCase().slice(-10)}`;
  const sample = SAMPLE_PRODUCTS[brandId] ?? SAMPLE_PRODUCTS.casher;
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
    productName: sample.name,
    size: sample.size,
    brandId,
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
    scale: 3,
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

function drawLines(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  size: number,
  lineHeight: number,
  x: number,
  topY: number,
  color = BLACK,
): number {
  let y = topY;
  for (const line of lines) {
    page.drawText(line, { x, y: y - size, size, font, color });
    y -= lineHeight;
  }
  return y;
}

/**
 * Макет 60×55:
 *  [лого]                    ЧЗ
 *  название вещи
 *  ┌─────┐  GTIN / S/N / 91
 *  │ DM  │  92…
 *  └─────┘
 *  ─────────────────────────
 *  BRAND · size
 */
export async function buildKmLabelPdf(input: KmLabelInput): Promise<Buffer> {
  const cis = input.cis.trim();
  if (!cis) throw new Error("Пустой код маркировки");

  const fields = parseCisFields(cis, input.gtin);
  const brandId = input.brandId ?? "casher";
  const brand = getBoxLabelBrand(brandId);
  const brandLabel = (brand?.label ?? brandId).toUpperCase();
  const productName = input.productName?.trim() || input.title?.trim() || "Товар";
  const sizeLabel = input.size?.trim() || "";

  const [dmPng, monoBytes, boldBytes, logoEntry] = await Promise.all([
    renderDataMatrixPng(cis),
    readFile(resolveFont("DejaVuSansMono.ttf")),
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
    getBrandSiteLogo(brandId).catch(() => null),
  ]);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const mono = await pdf.embedFont(monoBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const dm = await pdf.embedPng(dmPng);

  let logo: PDFImage | null = null;
  if (logoEntry) {
    try {
      logo = await pdf.embedPng(await prepareLogoPng(logoEntry.png));
    } catch {
      logo = null;
    }
  }

  const contentW = PAGE_W - MX * 2;
  let y = PAGE_H - MT;

  // --- Шапка: лого слева + «ЧЗ» справа ---
  const headerH = mmToPoints(5);
  if (logo) {
    const scale = Math.min((contentW * 0.38) / logo.width, headerH / logo.height);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    page.drawImage(logo, {
      x: MX,
      y: y - lh,
      width: lw,
      height: lh,
    });
  } else {
    page.drawText(brandLabel, {
      x: MX,
      y: y - 7,
      size: 7,
      font: bold,
      color: BLACK,
    });
  }
  const czMark = "ЧЗ";
  const czSize = 7;
  page.drawText(czMark, {
    x: PAGE_W - MX - bold.widthOfTextAtSize(czMark, czSize),
    y: y - czSize,
    size: czSize,
    font: bold,
    color: BLACK,
  });
  y -= headerH + 2;

  // тонкая линия под шапкой
  page.drawRectangle({
    x: MX,
    y: y - 0.6,
    width: contentW,
    height: 0.6,
    color: BLACK,
  });
  y -= 4;

  // --- Название вещи на всю ширину ---
  const nameSize = 6.5;
  const nameLH = nameSize * 1.18;
  const nameLines = wrapWords(mono, productName, nameSize, contentW).slice(0, 2);
  y = drawLines(page, mono, nameLines, nameSize, nameLH, MX, y);
  y -= 3;

  // --- Ряд: крупный DM слева + поля справа (заполняет пустоту) ---
  const rowBottom = MB + 14; // место под футер
  const rowH = Math.max(40, y - rowBottom);
  const dmTarget = Math.min(mmToPoints(22), rowH, contentW * 0.48);
  const dmScale = Math.min(dmTarget / dm.width, dmTarget / dm.height);
  const dmW = dm.width * dmScale;
  const dmH = dm.height * dmScale;
  const dmX = MX;
  const dmY = y - dmH;
  page.drawImage(dm, { x: dmX, y: dmY, width: dmW, height: dmH });

  // Рамка вокруг кода — акцент «на видном месте»
  page.drawRectangle({
    x: dmX - 1.2,
    y: dmY - 1.2,
    width: dmW + 2.4,
    height: dmH + 2.4,
    borderColor: BLACK,
    borderWidth: 0.7,
  });

  const metaX = dmX + dmW + 4;
  const metaW = PAGE_W - MX - metaX;
  const metaSize = 5;
  const metaLH = metaSize * 1.22;
  const metaLines: string[] = [];
  if (fields.gtin) metaLines.push(...wrapLine(mono, `GTIN`, metaSize, metaW));
  if (fields.gtin) metaLines.push(...wrapLine(mono, fields.gtin, metaSize, metaW));
  if (fields.serial) {
    metaLines.push(...wrapLine(mono, `S/N`, metaSize, metaW));
    metaLines.push(...wrapLine(mono, fields.serial, metaSize, metaW));
  }
  if (fields.key91) metaLines.push(...wrapLine(mono, `91 ${fields.key91}`, metaSize, metaW));
  if (fields.crypto92) {
    metaLines.push(...wrapLine(mono, `92`, metaSize, metaW));
    metaLines.push(...wrapLine(mono, fields.crypto92, metaSize, metaW));
  }

  // Растягиваем мета-строки по высоте DM, если места больше чем текста
  const metaNeeded = metaLines.length * metaLH;
  const metaPad = metaNeeded < dmH - 2 ? (dmH - 2 - metaNeeded) / Math.max(1, metaLines.length) : 0;
  const metaLHUse = metaLH + metaPad;
  drawLines(page, mono, metaLines, metaSize, metaLHUse, metaX, y, GRAY);

  y = Math.min(dmY, y - metaNeeded) - 3;

  // --- Футер: линия + бренд · размер ---
  const footerY = MB + 2;
  page.drawRectangle({
    x: MX,
    y: footerY + 9,
    width: contentW,
    height: 0.55,
    color: BLACK,
  });
  const footerLeft = `ЧЕСТНЫЙ ЗНАК`;
  const footerRight = sizeLabel ? `${brandLabel} · ${sizeLabel}` : brandLabel;
  page.drawText(footerLeft, {
    x: MX,
    y: footerY,
    size: 5,
    font: bold,
    color: BLACK,
  });
  const frW = mono.widthOfTextAtSize(footerRight, 5);
  page.drawText(footerRight, {
    x: PAGE_W - MX - frW,
    y: footerY,
    size: 5,
    font: mono,
    color: BLACK,
  });

  return Buffer.from(await pdf.save());
}
