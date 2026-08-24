import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

/** Тот же лист 150×100, что у баркодников (альбом 6×4″). */
const PAGE_W = 6 * 72;
const PAGE_H = 4 * 72;
const MARGIN_X = 26;
const MARGIN_Y = 16;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

export type GuideQrLabelInput = {
  title: string;
  subtitle?: string;
  url: string;
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

function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function fitWrapped(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferred: number,
  min: number,
  maxLines: number,
): { size: number; lines: string[] } {
  let size = preferred;
  while (size > min) {
    const lines = wrapLines(font, text, size, maxWidth);
    const overflow = lines.some((line) => font.widthOfTextAtSize(line, size) > maxWidth);
    if (lines.length <= maxLines && !overflow) return { size, lines };
    size -= 0.5;
  }
  const lines = wrapLines(font, text, min, maxWidth).slice(0, maxLines);
  return { size: min, lines };
}

function drawCentered(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  baselineY: number,
) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_W - tw) / 2,
    y: baselineY,
    size,
    font,
    color: BLACK,
  });
}

export async function buildGuideQrLabelPdf(input: GuideQrLabelInput): Promise<Buffer> {
  const title = input.title.trim() || "ГАЙД";
  const subtitle = input.subtitle?.trim() || "";
  const contentW = PAGE_W - MARGIN_X * 2;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const [regularBytes, boldBytes, qrPng] = await Promise.all([
    readFile(resolveFont("DejaVuSans.ttf")),
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
    QRCode.toBuffer(input.url, {
      type: "png",
      errorCorrectionLevel: "H",
      margin: 1,
      width: 900,
      color: { dark: "#000000", light: "#FFFFFF" },
    }),
  ]);

  const font = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const qrImage = await pdf.embedPng(qrPng);

  const kicker = "ГАЙД";
  const kickerSize = 10;
  const hint = "Наведи камеру телефона";
  const hintSize = 9;

  const titleFit = fitWrapped(bold, title.toUpperCase(), contentW, 22, 13, 3);
  const subtitleFit = subtitle
    ? fitWrapped(font, subtitle, contentW, 11, 8, 2)
    : { size: 0, lines: [] as string[] };

  const titleBlockH =
    titleFit.lines.length * (titleFit.size * 1.18) - titleFit.size * 0.18;
  const subtitleBlockH =
    subtitleFit.lines.length > 0
      ? 6 + subtitleFit.lines.length * (subtitleFit.size * 1.2) - subtitleFit.size * 0.2
      : 0;

  const gapKicker = 8;
  const gapBeforeQr = 12;
  const gapAfterQr = 10;
  const chromeH =
    kickerSize + gapKicker + titleBlockH + subtitleBlockH + gapBeforeQr + gapAfterQr + hintSize;
  const usableH = PAGE_H - MARGIN_Y * 2;
  const qrSize = Math.min(176, Math.max(132, usableH - chromeH));
  const blockH = chromeH + qrSize;
  let y = MARGIN_Y + (usableH + blockH) / 2;

  y -= kickerSize;
  drawCentered(page, bold, kicker, kickerSize, y);

  y -= gapKicker;
  for (const line of titleFit.lines) {
    y -= titleFit.size;
    drawCentered(page, bold, line, titleFit.size, y);
    y -= titleFit.size * 0.18;
  }

  if (subtitleFit.lines.length > 0) {
    y -= 6;
    for (const line of subtitleFit.lines) {
      y -= subtitleFit.size;
      drawCentered(page, font, line, subtitleFit.size, y);
      y -= subtitleFit.size * 0.2;
    }
  }

  y -= gapBeforeQr + qrSize;
  page.drawImage(qrImage, {
    x: (PAGE_W - qrSize) / 2,
    y,
    width: qrSize,
    height: qrSize,
  });

  y -= gapAfterQr + hintSize;
  drawCentered(page, font, hint, hintSize, y);

  return Buffer.from(await pdf.save());
}
