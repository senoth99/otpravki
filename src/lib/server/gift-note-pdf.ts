import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { getGiftNoteImage, type GiftNoteLayout } from "@/lib/gift-note-presets";

export type { GiftNoteLayout };

/** Альбом 150×100 мм — как бренд/трек/коробка. */
const PAGE_W = 6 * 72;
const PAGE_H = 4 * 72;
const MARGIN = 18;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

export type GiftNoteInput = {
  text: string;
  imageId?: string | null;
  layout?: GiftNoteLayout;
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

function resolvePublicAsset(src: string): string {
  const rel = src.replace(/^\//, "");
  const candidates = [
    path.join(process.cwd(), "public", rel),
    process.env.APP_DIR?.trim() ? path.join(process.env.APP_DIR.trim(), "public", rel) : "",
  ].filter(Boolean);
  for (const full of candidates) {
    if (existsSync(full)) return full;
  }
  throw new Error(`Нет картинки ${src}`);
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .trim();
}

function wrapLine(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];

  const words = text.split(" ");
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
      continue;
    }
    // длинное слово без пробелов — режем по символам
    let chunk = "";
    for (const ch of word) {
      const next = chunk + ch;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        chunk = next;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    out.push(...wrapLine(font, paragraph, size, maxWidth));
  }
  return out;
}

function fitText(
  font: PDFFont,
  text: string,
  maxWidth: number,
  maxHeight: number,
  preferred: number,
  min = 14,
): { size: number; lines: string[]; lineHeight: number } {
  let size = preferred;
  while (size >= min) {
    const lines = wrapText(font, text, size, maxWidth);
    const lineHeight = size * 1.22;
    if (lines.length * lineHeight <= maxHeight) {
      return { size, lines, lineHeight };
    }
    size -= 1;
  }
  const lines = wrapText(font, text, min, maxWidth);
  return { size: min, lines, lineHeight: min * 1.22 };
}

function drawCenteredLines(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  size: number,
  lineHeight: number,
  areaX: number,
  areaW: number,
  topY: number,
) {
  let y = topY;
  for (const line of lines) {
    const tw = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: areaX + Math.max(0, (areaW - tw) / 2),
      y: y - size,
      size,
      font,
      color: BLACK,
    });
    y -= lineHeight;
  }
}

async function loadImagePng(src: string): Promise<Buffer> {
  const file = resolvePublicAsset(src);
  const raw = await readFile(file);
  if (src.endsWith(".svg")) {
    return sharp(raw).resize(600, 600, { fit: "inside" }).png().toBuffer();
  }
  return sharp(raw)
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function embedNoteImage(
  pdf: PDFDocument,
  imageId: string | null | undefined,
): Promise<PDFImage | null> {
  const meta = getGiftNoteImage(imageId);
  if (!meta) return null;
  const png = await loadImagePng(meta.src);
  return pdf.embedPng(png);
}

export async function buildGiftNotePdf(input: GiftNoteInput): Promise<Buffer> {
  const text = normalizeText(input.text ?? "");
  let layout: GiftNoteLayout =
    input.layout ??
    (input.imageId && text ? "image-left" : input.imageId ? "image-only" : "text");

  if (!text && input.imageId) layout = "image-only";
  if (text && !input.imageId) layout = "text";

  if (!text && layout !== "image-only") {
    throw new Error("Напиши текст или выбери только картинку");
  }
  if (layout === "image-only" && !input.imageId) {
    throw new Error("Выбери картинку");
  }

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const [boldBytes, image] = await Promise.all([
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
    embedNoteImage(pdf, input.imageId),
  ]);
  const bold = await pdf.embedFont(boldBytes, { subset: true });

  const contentX = MARGIN;
  const contentY = MARGIN;
  const contentW = PAGE_W - MARGIN * 2;
  const contentH = PAGE_H - MARGIN * 2;

  if (layout === "image-only" && image) {
    const scale = Math.min(contentW / image.width, contentH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, {
      x: contentX + (contentW - w) / 2,
      y: contentY + (contentH - h) / 2,
      width: w,
      height: h,
    });
    return Buffer.from(await pdf.save());
  }

  if (layout === "image-top" && image && text) {
    const imgMaxH = contentH * 0.38;
    const imgScale = Math.min(contentW * 0.45 / image.width, imgMaxH / image.height, 1);
    const imgW = image.width * imgScale;
    const imgH = image.height * imgScale;
    const imgY = contentY + contentH - imgH;
    page.drawImage(image, {
      x: contentX + (contentW - imgW) / 2,
      y: imgY,
      width: imgW,
      height: imgH,
    });
    const textTop = imgY - 12;
    const textH = textTop - contentY;
    const fitted = fitText(bold, text, contentW, textH, 36, 16);
    const blockH = fitted.lines.length * fitted.lineHeight;
    const topY = contentY + textH - Math.max(0, (textH - blockH) / 2);
    drawCenteredLines(page, bold, fitted.lines, fitted.size, fitted.lineHeight, contentX, contentW, topY);
    return Buffer.from(await pdf.save());
  }

  if (layout === "image-left" && image && text) {
    const imgMaxW = contentW * 0.34;
    const imgScale = Math.min(imgMaxW / image.width, contentH / image.height, 1);
    const imgW = image.width * imgScale;
    const imgH = image.height * imgScale;
    page.drawImage(image, {
      x: contentX,
      y: contentY + (contentH - imgH) / 2,
      width: imgW,
      height: imgH,
    });
    const textX = contentX + imgW + 16;
    const textW = contentW - imgW - 16;
    const fitted = fitText(bold, text, textW, contentH, 34, 15);
    const blockH = fitted.lines.length * fitted.lineHeight;
    const topY = contentY + contentH - Math.max(0, (contentH - blockH) / 2);
    drawCenteredLines(page, bold, fitted.lines, fitted.size, fitted.lineHeight, textX, textW, topY);
    return Buffer.from(await pdf.save());
  }

  // text only
  const fitted = fitText(bold, text || " ", contentW, contentH, 42, 16);
  const blockH = fitted.lines.length * fitted.lineHeight;
  const topY = contentY + contentH - Math.max(0, (contentH - blockH) / 2);
  drawCenteredLines(page, bold, fitted.lines, fitted.size, fitted.lineHeight, contentX, contentW, topY);

  return Buffer.from(await pdf.save());
}
