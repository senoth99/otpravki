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

/** Data Matrix ~18 мм — компактно, место под текст. */
const DM_MAX_MM = 18;
/** Лого сверху: было ~7 мм, уменьшили в 1.5 раза. */
const LOGO_MAX_H_MM = 7 / 1.5;
const LOGO_MAX_W_RATIO = 0.52;

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

  let logo: PDFImage | null = null;
  if (logoEntry) {
    try {
      logo = await pdf.embedPng(await prepareLogoPng(logoEntry.png));
    } catch {
      logo = null;
    }
  }

  const textWidth = PAGE_W - MARGIN * 2;
  const gapLogoDm = 2.5;
  const gapDmText = 3;

  // --- размеры блоков ---
  let logoW = 0;
  let logoH = 0;
  if (logo) {
    const logoMaxW = textWidth * LOGO_MAX_W_RATIO;
    const logoMaxH = mmToPoints(LOGO_MAX_H_MM);
    const scale = Math.min(logoMaxW / logo.width, logoMaxH / logo.height);
    logoW = logo.width * scale;
    logoH = logo.height * scale;
  } else {
    logoH = 8;
  }

  const dmMax = mmToPoints(DM_MAX_MM);
  let dmScale = Math.min(dmMax / dm.width, dmMax / dm.height);
  let dmW = dm.width * dmScale;
  let dmH = dm.height * dmScale;

  let nameSize = 6.5;
  let metaSize = 5.5;
  let nameLines = wrapWords(mono, productName, nameSize, textWidth);
  let metaLines: string[] = [];
  const rebuildMeta = (size: number) => {
    const lines: string[] = [];
    if (fields.gtin) lines.push(...wrapLine(mono, `GTIN ${fields.gtin}`, size, textWidth));
    if (fields.serial) lines.push(...wrapLine(mono, `S/N  ${fields.serial}`, size, textWidth));
    if (fields.key91) lines.push(...wrapLine(mono, `91   ${fields.key91}`, size, textWidth));
    if (fields.crypto92) lines.push(...wrapLine(mono, `92   ${fields.crypto92}`, size, textWidth));
    return lines;
  };
  metaLines = rebuildMeta(metaSize);

  const textBlockH = (sizes: { name: number; meta: number; names: string[]; metas: string[] }) => {
    const nameLH = sizes.name * 1.22;
    const metaLH = sizes.meta * 1.2;
    const gap = sizes.names.length && sizes.metas.length ? 2.5 : 0;
    return sizes.names.length * nameLH + gap + sizes.metas.length * metaLH;
  };

  let textH = textBlockH({
    name: nameSize,
    meta: metaSize,
    names: nameLines,
    metas: metaLines,
  });

  const fixedTop = logoH + gapLogoDm + dmH + gapDmText;
  let used = fixedTop + textH;
  const budget = PAGE_H - MARGIN * 2;

  // Если снизу пусто — чуть увеличиваем DM и/или шрифт, чтобы заполнить этикетку.
  if (used < budget - 6) {
    let spare = budget - used;
    // до половины запаса — в Data Matrix (но не больше 22 мм)
    const dmBoost = Math.min(spare * 0.45, mmToPoints(22) - dmH);
    if (dmBoost > 1) {
      const target = dmH + dmBoost;
      dmScale = Math.min(target / dm.height, (textWidth * 0.7) / dm.width);
      dmW = dm.width * dmScale;
      dmH = dm.height * dmScale;
      spare = budget - (logoH + gapLogoDm + dmH + gapDmText + textH);
    }
    // остаток — в межстрочный интервал текста (визуально «ровнее» заполняет низ)
    if (spare > 2) {
      const lineCount = nameLines.length + metaLines.length;
      const bump = Math.min(1.4, spare / Math.max(1, lineCount));
      nameSize = Math.min(7.5, nameSize + bump * 0.15);
      metaSize = Math.min(6.5, metaSize + bump * 0.12);
      nameLines = wrapWords(mono, productName, nameSize, textWidth);
      metaLines = rebuildMeta(metaSize);
      textH = textBlockH({
        name: nameSize,
        meta: metaSize,
        names: nameLines,
        metas: metaLines,
      });
    }
  }

  // Если не влезает — ужимаем DM, потом meta
  used = logoH + gapLogoDm + dmH + gapDmText + textH;
  if (used > budget) {
    const overflow = used - budget;
    const shrink = Math.min(overflow, dmH * 0.35);
    if (shrink > 0.5) {
      const target = dmH - shrink;
      dmScale = Math.min(target / dm.height, dmMax / dm.width);
      dmW = dm.width * dmScale;
      dmH = dm.height * dmScale;
    }
    used = logoH + gapLogoDm + dmH + gapDmText + textH;
    if (used > budget) {
      const scale = Math.max(0.82, (budget - (logoH + gapLogoDm + dmH + gapDmText)) / textH);
      nameSize *= Math.max(0.9, scale);
      metaSize *= scale;
      nameLines = wrapWords(mono, productName, nameSize, textWidth);
      metaLines = rebuildMeta(metaSize);
      textH = textBlockH({
        name: nameSize,
        meta: metaSize,
        names: nameLines,
        metas: metaLines,
      });
    }
  }

  // Финальная раскладка сверху вниз с равномерным «дыханием» остатка
  used = logoH + gapLogoDm + dmH + gapDmText + textH;
  const spareFinal = Math.max(0, budget - used);
  const padAfterLogo = gapLogoDm + spareFinal * 0.25;
  const padAfterDm = gapDmText + spareFinal * 0.35;
  // 0.4 spare уходит под низ как нижний отступ (не липнем к краю)

  let cursorY = PAGE_H - MARGIN;

  if (logo) {
    cursorY -= logoH;
    page.drawImage(logo, {
      x: (PAGE_W - logoW) / 2,
      y: cursorY,
      width: logoW,
      height: logoH,
    });
  } else {
    const brandLabel = brandId.toUpperCase();
    const size = 7;
    const tw = mono.widthOfTextAtSize(brandLabel, size);
    cursorY -= size;
    page.drawText(brandLabel, {
      x: (PAGE_W - tw) / 2,
      y: cursorY,
      size,
      font: mono,
      color: BLACK,
    });
  }

  cursorY -= padAfterLogo + dmH;
  page.drawImage(dm, {
    x: (PAGE_W - dmW) / 2,
    y: cursorY,
    width: dmW,
    height: dmH,
  });

  cursorY -= padAfterDm;
  const nameLH = nameSize * 1.22;
  const metaLH = metaSize * 1.2;
  cursorY = drawLeftLines(page, mono, nameLines, nameSize, nameLH, MARGIN, cursorY);
  if (nameLines.length && metaLines.length) cursorY -= 2.5;
  drawLeftLines(page, mono, metaLines, metaSize, metaLH, MARGIN, cursorY);

  return Buffer.from(await pdf.save());
}
