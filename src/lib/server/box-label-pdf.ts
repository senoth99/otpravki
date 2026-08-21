import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getBoxLabelBrand, type BoxLabelBrandId } from "@/lib/box-label-brands";
import { getBrandSiteLogo } from "@/lib/server/brand-site-logo";

/** Альбом 150×100 мм (6×4″) — горизонтальная этикетка как бренд/трек. */
const PAGE_W = 6 * 72;
const PAGE_H = 4 * 72;
const MARGIN_X = 28;
const MARGIN_Y = 14;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

export type BoxLabelInput = {
  brandId: BoxLabelBrandId;
  category: string;
  name: string;
  color: string;
  size: string;
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

function normalizeLine(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function formatName(raw: string): string {
  const t = normalizeLine(raw);
  if (!t) return "";
  if (/^[«"].*[»"]$/.test(t)) return t.toUpperCase();
  return `«${t.toUpperCase()}»`;
}

function formatColor(raw: string): string {
  const t = normalizeLine(raw);
  if (!t) return "";
  if (/^color\s*:/i.test(t)) return t.toUpperCase();
  return `COLOR: ${t.toUpperCase()}`;
}

function formatSize(raw: string): string {
  const t = normalizeLine(raw);
  if (!t) return "";
  if (/^size\s*:/i.test(t)) return t.toUpperCase();
  return `SIZE: ${t.toUpperCase()}`;
}

function fitFontSize(font: PDFFont, text: string, maxWidth: number, preferred: number, min = 10): number {
  let size = preferred;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawCentered(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  baselineY: number,
) {
  const tw = font.widthOfTextAtSize(text, size);
  const x = (PAGE_W - tw) / 2;
  page.drawText(text, {
    x,
    y: baselineY,
    size,
    font,
    color: BLACK,
  });
}

export async function buildBoxLabelPdf(input: BoxLabelInput): Promise<Buffer> {
  const brand = getBoxLabelBrand(input.brandId);
  if (!brand) throw new Error("Неизвестный бренд");

  const category = normalizeLine(input.category).toUpperCase();
  const name = formatName(input.name);
  const color = formatColor(input.color);
  const size = formatSize(input.size);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const [regularBytes, boldBytes, logo] = await Promise.all([
    readFile(resolveFont("DejaVuSans.ttf")),
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
    getBrandSiteLogo(input.brandId),
  ]);
  const font = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const logoImage = await pdf.embedPng(logo.png);

  const contentW = PAGE_W - MARGIN_X * 2;
  const logoMaxW = contentW * 0.42;
  const logoMaxH = 42;
  const logoScale = Math.min(logoMaxW / logoImage.width, logoMaxH / logoImage.height, 1);
  const logoW = logoImage.width * logoScale;
  const logoH = logoImage.height * logoScale;

  const brandLabel = brand.label.toUpperCase();
  const brandSize = fitFontSize(bold, brandLabel, contentW, 14, 10);

  const gap = 10;
  const catSize = category ? fitFontSize(font, category, contentW, 15, 10) : 0;
  const nameSize = name ? fitFontSize(bold, name, contentW, 36, 18) : 0;
  const colorSize = color ? fitFontSize(font, color, contentW, 12, 9) : 0;
  const sizeSize = size ? fitFontSize(bold, size, contentW, 22, 12) : 0;

  const blockH =
    logoH +
    (category ? gap + catSize : 0) +
    (name ? gap + nameSize : 0) +
    (color ? gap + colorSize : 0) +
    (size ? gap + sizeSize : 0);

  const topY = PAGE_H - MARGIN_Y;
  const bottomBrandY = MARGIN_Y;
  const available = topY - bottomBrandY - brandSize - 12;
  const startY = topY - Math.max(0, (available - blockH) / 2);

  let y = startY - logoH;
  page.drawImage(logoImage, {
    x: (PAGE_W - logoW) / 2,
    y,
    width: logoW,
    height: logoH,
  });

  if (category) {
    y -= gap + catSize;
    drawCentered(page, font, category, catSize, y);
  }
  if (name) {
    y -= gap + nameSize;
    drawCentered(page, bold, name, nameSize, y);
  }
  if (color) {
    y -= gap + colorSize;
    drawCentered(page, font, color, colorSize, y);
  }
  if (size) {
    y -= gap + sizeSize;
    drawCentered(page, bold, size, sizeSize, y);
  }

  drawCentered(page, bold, brandLabel, brandSize, bottomBrandY);

  return Buffer.from(await pdf.save());
}
