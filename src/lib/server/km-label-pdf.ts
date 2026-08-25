import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import bwipjs from "bwip-js";
import { PDFDocument, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import sharp from "sharp";
import { getBoxLabelBrand, type BoxLabelBrandId } from "@/lib/box-label-brands";
import { mmToPoints } from "@/lib/label-media";
import { getBrandSiteLogo } from "@/lib/server/brand-site-logo";

/** Этикетка ЧЗ на WS408: 60×55 мм, ~203 dpi. */
export const KM_LABEL_WIDTH_MM = 60;
export const KM_LABEL_HEIGHT_MM = 55;

const PAGE_W = mmToPoints(KM_LABEL_WIDTH_MM);
const PAGE_H = mmToPoints(KM_LABEL_HEIGHT_MM);
const MX = mmToPoints(3);
const MT = mmToPoints(7);
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
    scale: 5,
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
    .trim({ threshold: 24 })
    .greyscale()
    .normalize()
    .linear(1.45, -28)
    .threshold(185)
    .resize({
      width: 720,
      height: 200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

/**
 * Одежда / 60×55 / 203 dpi:
 *  [лого по центру]
 *  название
 *  [ DM ]  GTIN / S/N
 *  размер чёрным текстом (без плашки)
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

  const [dmPng, regularBytes, boldBytes, logoEntry] = await Promise.all([
    renderDataMatrixPng(cis),
    readFile(resolveFont("DejaVuSans.ttf")),
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
    getBrandSiteLogo(brandId).catch(() => null),
  ]);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const regular = await pdf.embedFont(regularBytes, { subset: true });
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
  const sizeLetterSz = 20;
  const sizeBottom = MB;
  const contentBottom = sizeBottom + sizeLetterSz + mmToPoints(2.5);
  let y = PAGE_H - MT;

  // --- Лого по центру ---
  const logoMaxW = mmToPoints(32);
  const logoMaxH = mmToPoints(6);
  if (logo) {
    const scale = Math.min(logoMaxW / logo.width, logoMaxH / logo.height, contentW / logo.width);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    page.drawImage(logo, {
      x: (PAGE_W - lw) / 2,
      y: y - lh,
      width: lw,
      height: lh,
    });
    y -= lh + mmToPoints(2);
  } else {
    const brandSz = fitFontSize(bold, brandLabel, contentW, 11, 8);
    page.drawText(brandLabel, {
      x: (PAGE_W - bold.widthOfTextAtSize(brandLabel, brandSz)) / 2,
      y: y - brandSz,
      size: brandSz,
      font: bold,
      color: BLACK,
    });
    y -= brandSz + mmToPoints(2);
  }

  // --- Название ---
  const nameSize = 9;
  const nameLH = nameSize * 1.12;
  const nameLines = wrapWords(bold, productName, nameSize, contentW).slice(0, 2);
  for (const line of nameLines) {
    page.drawText(line, { x: MX, y: y - nameSize, size: nameSize, font: bold, color: BLACK });
    y -= nameLH;
  }
  y -= mmToPoints(2);

  // --- DM + мета справа (тонкий высокий шрифт, не вылезает) ---
  const rightPad = mmToPoints(3.5);
  const gapDmMeta = mmToPoints(2);
  const availH = Math.max(mmToPoints(18), y - contentBottom);
  const metaMaxW = contentW * 0.42;
  const dmMaxW = contentW - metaMaxW - gapDmMeta;
  const dmTarget = Math.min(mmToPoints(24), availH, dmMaxW);
  const dmScale = Math.min(dmTarget / dm.width, dmTarget / dm.height);
  const dmW = dm.width * dmScale;
  const dmH = dm.height * dmScale;
  const dmX = MX;
  const dmY = y - dmH;
  page.drawImage(dm, { x: dmX, y: Math.max(contentBottom, dmY), width: dmW, height: dmH });

  const metaX = dmX + dmW + gapDmMeta;
  const metaW = PAGE_W - rightPad - metaX;
  // тонкий regular, крупнее по высоте; ширина подгоняется под metaW
  const labelSz = 7.5;
  const valueSzMax = 10;
  let metaY = y;

  const drawMeta = (label: string, value: string) => {
    if (!value || metaY - labelSz < contentBottom) return;
    page.drawText(label, {
      x: metaX,
      y: metaY - labelSz,
      size: labelSz,
      font: regular,
      color: BLACK,
    });
    metaY -= labelSz + 2.5;
    const vSz = fitFontSize(regular, value, metaW, valueSzMax, 6.5);
    const lines = wrapLine(regular, value, vSz, metaW).slice(0, 2);
    for (const line of lines) {
      if (metaY - vSz < contentBottom) break;
      page.drawText(line, {
        x: metaX,
        y: metaY - vSz,
        size: vSz,
        font: regular,
        color: BLACK,
      });
      metaY -= vSz * 1.2;
    }
    metaY -= mmToPoints(2);
  };

  drawMeta("GTIN", fields.gtin);
  drawMeta("S/N", fields.serial);

  // --- Размер: крупнее и жирнее ---
  const sz = fitFontSize(bold, sizeLabel, contentW - 4, sizeLetterSz, 14);
  page.drawText(sizeLabel, {
    x: (PAGE_W - bold.widthOfTextAtSize(sizeLabel, sz)) / 2,
    y: sizeBottom,
    size: sz,
    font: bold,
    color: BLACK,
  });

  return Buffer.from(await pdf.save());
}
