import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getBoxLabelBrand, type BoxLabelBrandId } from "@/lib/box-label-brands";
import { getBrandSiteLogo } from "@/lib/server/brand-site-logo";

/** Альбом 150×100 мм (6×4″) — как остальные этикетки на TSC. */
const PAGE_W = 6 * 72;
const PAGE_H = 4 * 72;
const MARGIN_X = 24;
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
  y: number,
  maxWidth: number,
) {
  const tw = Math.min(font.widthOfTextAtSize(text, size), maxWidth);
  const x = (PAGE_W - tw) / 2;
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: BLACK,
    maxWidth,
  });
  return size;
}

export async function buildBoxLabelPdf(input: BoxLabelInput): Promise<Buffer> {
  const brand = getBoxLabelBrand(input.brandId);
  if (!brand) throw new Error("Неизвестный бренд");

  const category = normalizeLine(input.category).toUpperCase();
  const name = formatName(input.name);
  const color = formatColor(input.color);
  const size = formatSize(input.size);

  if (!category && !name && !color && !size) {
    throw new Error("Заполни хотя бы одно поле надписи");
  }

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
  const logoMaxW = contentW * 0.45;
  const logoMaxH = 48;
  const logoScale = Math.min(logoMaxW / logoImage.width, logoMaxH / logoImage.height, 1);
  const logoW = logoImage.width * logoScale;
  const logoH = logoImage.height * logoScale;

  // Горизонтальная этикетка, стопка по центру сверху вниз
  let y = PAGE_H - 18 - logoH;
  page.drawImage(logoImage, {
    x: (PAGE_W - logoW) / 2,
    y,
    width: logoW,
    height: logoH,
  });

  y -= 16;
  if (category) {
    const sz = fitFontSize(font, category, contentW, 18, 11);
    drawCentered(page, font, category, sz, y, contentW);
    y -= sz + 8;
  }

  if (name) {
    const sz = fitFontSize(bold, name, contentW, 36, 18);
    drawCentered(page, bold, name, sz, y, contentW);
    y -= sz + 8;
  }

  if (color) {
    const sz = fitFontSize(bold, color, contentW, 12, 9);
    drawCentered(page, bold, color, sz, y, contentW);
    y -= sz + 8;
  }

  if (size) {
    const sz = fitFontSize(bold, size, contentW, 22, 12);
    drawCentered(page, bold, size, sz, y, contentW);
  }

  const brandLabel = brand.label.toUpperCase();
  const brandSize = fitFontSize(bold, brandLabel, contentW, 14, 10);
  drawCentered(page, bold, brandLabel, brandSize, 14, contentW);

  return Buffer.from(await pdf.save());
}
