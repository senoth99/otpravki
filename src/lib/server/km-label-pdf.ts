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

/** Этикетка ЧЗ на WS408: 60×55 мм, ~203 dpi. */
export const KM_LABEL_WIDTH_MM = 60;
export const KM_LABEL_HEIGHT_MM = 55;

const PAGE_W = mmToPoints(KM_LABEL_WIDTH_MM);
const PAGE_H = mmToPoints(KM_LABEL_HEIGHT_MM);
/** Поля с запасом: верх SATO часто клипает. */
const MX = mmToPoints(3.5);
const MT = mmToPoints(6.5);
const MB = mmToPoints(4);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

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
  return { gtin, serial };
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

function fitFontSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): number {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
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
    scale: 4,
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

/** Лого под термопечать: обрезка полей, жёсткий Ч/Б, без «вылезания». */
async function prepareLogoPng(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .ensureAlpha()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .trim({ threshold: 24 })
    .greyscale()
    .normalize()
    .linear(1.45, -28)
    .threshold(185)
    .resize({
      width: 720,
      height: 240,
      fit: "inside",
      withoutEnlargement: true,
    })
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
): number {
  let y = topY;
  for (const line of lines) {
    page.drawText(line, { x, y: y - size, size, font, color: BLACK });
    y -= lineHeight;
  }
  return y;
}

/**
 * Одежда / 60×55 / 203 dpi:
 *  [лого]              [ SIZE ]
 *  название
 *  ┌──────┐  GTIN
 *  │  DM  │  …
 *  └──────┘  S/N
 *
 * Без надписи «честный знак», без полосок, без 91/92.
 */
export async function buildKmLabelPdf(input: KmLabelInput): Promise<Buffer> {
  const cis = input.cis.trim();
  if (!cis) throw new Error("Пустой код маркировки");

  const fields = parseCisFields(cis, input.gtin);
  const brandId = input.brandId ?? "casher";
  const brand = getBoxLabelBrand(brandId);
  const brandLabel = (brand?.label ?? brandId).toUpperCase();
  const productName = input.productName?.trim() || input.title?.trim() || "Товар";
  const sizeLabel = (input.size?.trim() || "—").toUpperCase();

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
  const headerTop = PAGE_H - MT;

  // --- Шапка: лого слева + бейдж размера справа (строго внутри MT) ---
  const logoMaxW = mmToPoints(28);
  const logoMaxH = mmToPoints(5.5);
  const sizeBadgeW = mmToPoints(15);
  const sizeBadgeH = mmToPoints(9);
  const sizeBadgeX = PAGE_W - MX - sizeBadgeW;
  const sizeBadgeY = headerTop - sizeBadgeH;

  page.drawRectangle({
    x: sizeBadgeX,
    y: sizeBadgeY,
    width: sizeBadgeW,
    height: sizeBadgeH,
    color: BLACK,
  });
  const sizeCap = "SIZE";
  const sizeCapSz = 5;
  page.drawText(sizeCap, {
    x: sizeBadgeX + (sizeBadgeW - bold.widthOfTextAtSize(sizeCap, sizeCapSz)) / 2,
    y: sizeBadgeY + sizeBadgeH - sizeCapSz - 1.2,
    size: sizeCapSz,
    font: bold,
    color: WHITE,
  });
  const sizeLetterSz = fitFontSize(bold, sizeLabel, sizeBadgeW - 3, 12, 7);
  page.drawText(sizeLabel, {
    x: sizeBadgeX + (sizeBadgeW - bold.widthOfTextAtSize(sizeLabel, sizeLetterSz)) / 2,
    y: sizeBadgeY + 1.8,
    size: sizeLetterSz,
    font: bold,
    color: WHITE,
  });

  const logoAreaW = sizeBadgeX - MX - mmToPoints(2);
  if (logo) {
    const scale = Math.min(logoMaxW / logo.width, logoMaxH / logo.height, logoAreaW / logo.width);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    // низ лого внутри бейджа, верх ≤ headerTop
    const logoY = sizeBadgeY + (sizeBadgeH - lh) / 2;
    page.drawImage(logo, {
      x: MX,
      y: Math.min(logoY, headerTop - lh),
      width: lw,
      height: lh,
    });
  } else {
    const brandSz = fitFontSize(bold, brandLabel, logoAreaW, 10, 7);
    page.drawText(brandLabel, {
      x: MX,
      y: sizeBadgeY + (sizeBadgeH - brandSz) / 2,
      size: brandSz,
      font: bold,
      color: BLACK,
    });
  }

  let y = sizeBadgeY - mmToPoints(2.5);

  // --- Название ---
  const nameSize = 8.5;
  const nameLH = nameSize * 1.14;
  const nameLines = wrapWords(bold, productName, nameSize, contentW).slice(0, 2);
  y = drawLines(page, bold, nameLines, nameSize, nameLH, MX, y);
  y -= mmToPoints(2.5);

  // --- DM + GTIN / S/N (без полосок и рамки, чтобы ничего не наезжало) ---
  const dmPad = 0;
  const rowBottom = MB;
  const availH = Math.max(mmToPoints(20), y - rowBottom);
  const dmTarget = Math.min(mmToPoints(24), availH, contentW * 0.5);
  const dmScale = Math.min(dmTarget / dm.width, dmTarget / dm.height);
  const dmW = dm.width * dmScale;
  const dmH = dm.height * dmScale;
  const dmX = MX + dmPad;
  const dmY = Math.max(rowBottom, y - dmH);

  page.drawImage(dm, { x: dmX, y: dmY, width: dmW, height: dmH });

  const metaX = dmX + dmW + mmToPoints(2.8);
  const metaW = PAGE_W - MX - metaX;
  const labelSz = 6.5;
  const valueSz = 8;
  const gap = 3;

  let metaY = y;
  const drawMetaBlock = (label: string, value: string) => {
    if (!value) return;
    if (metaY - labelSz < MB) return;
    page.drawText(label, {
      x: metaX,
      y: metaY - labelSz,
      size: labelSz,
      font: bold,
      color: BLACK,
    });
    metaY -= labelSz + 1.4;
    const valueLines = wrapLine(mono, value, valueSz, metaW).slice(0, 2);
    for (const line of valueLines) {
      if (metaY - valueSz < MB) break;
      page.drawText(line, {
        x: metaX,
        y: metaY - valueSz,
        size: valueSz,
        font: mono,
        color: BLACK,
      });
      metaY -= valueSz * 1.12;
    }
    metaY -= gap;
  };

  drawMetaBlock("GTIN", fields.gtin);
  drawMetaBlock("S/N", fields.serial);

  return Buffer.from(await pdf.save());
}
