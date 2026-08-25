import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import bwipjs from "bwip-js";
import { PDFDocument, rgb } from "pdf-lib";
import { mmToPoints } from "@/lib/label-media";

/** Этикетка ЧЗ на WS408: 60×55 мм. */
export const KM_LABEL_WIDTH_MM = 60;
export const KM_LABEL_HEIGHT_MM = 55;

const PAGE_W = mmToPoints(KM_LABEL_WIDTH_MM);
const PAGE_H = mmToPoints(KM_LABEL_HEIGHT_MM);
const MARGIN = 5;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

export type KmLabelInput = {
  cis: string;
  gtin?: string;
  title?: string;
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

function extractGtin(cis: string, fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  if (cis.startsWith("01") && cis.length >= 16) return cis.slice(2, 16);
  return "";
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Сэмпл КМ для тест-печати (не из ЦРПТ). GTIN с валидной контрольной цифрой. */
export function buildSampleKmCis(): KmLabelInput {
  const gtin = "04604341401012"; // check digit OK for GS1
  const serial = `T${Date.now().toString(36).toUpperCase().slice(-10)}`;
  const cis = [
    `01${gtin}`,
    `21${serial}`,
    "\u001d",
    "91EE06",
    "\u001d",
    "92dGVzdFNpZ25hdHVyZUNoZXN0bnlZbmFrVGVzdA==",
  ].join("");
  return { cis, gtin, title: "Тест · Честный знак" };
}

function toGs1ParenForm(cis: string): string | null {
  // 01+GTIN14 + 21+serial + GS + 91.. + GS + 92..
  const parts = cis.split("\u001d");
  const head = parts[0] ?? "";
  if (!head.startsWith("01") || head.length < 18 || !head.includes("21")) return null;
  const gtin = head.slice(2, 16);
  const serial = head.slice(18); // after 01+14+21
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
  const gs1 = toGs1ParenForm(cis);
  if (gs1) {
    try {
      return await bwipjs.toBuffer({
        bcid: "gs1datamatrix",
        text: gs1,
        scale: 4,
        height: 20,
        includetext: false,
        paddingwidth: 2,
        paddingheight: 2,
        backgroundcolor: "FFFFFF",
        barcolor: "000000",
      });
    } catch {
      // fallback below
    }
  }
  return bwipjs.toBuffer({
    bcid: "datamatrix",
    text: cis,
    scale: 4,
    height: 20,
    includetext: false,
    paddingwidth: 2,
    paddingheight: 2,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
}

export async function buildKmLabelPdf(input: KmLabelInput): Promise<Buffer> {
  const cis = input.cis.trim();
  if (!cis) throw new Error("Пустой код маркировки");

  const gtin = extractGtin(cis, input.gtin);
  const title = input.title?.trim() || "Честный знак";

  const [dmPng, boldBytes, regularBytes] = await Promise.all([
    renderDataMatrixPng(cis),
    readFile(resolveFont("DejaVuSans-Bold.ttf")),
    readFile(resolveFont("DejaVuSans.ttf")),
  ]);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });

  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const dm = await pdf.embedPng(dmPng);

  const headerH = 22;
  const footerH = 28;
  const contentTop = PAGE_H - MARGIN;
  const contentBottom = MARGIN;

  page.drawText(title, {
    x: MARGIN,
    y: contentTop - 11,
    size: 9,
    font: bold,
    color: BLACK,
  });
  if (gtin) {
    const gtinLabel = `GTIN ${gtin}`;
    const tw = regular.widthOfTextAtSize(gtinLabel, 7);
    page.drawText(gtinLabel, {
      x: PAGE_W - MARGIN - tw,
      y: contentTop - 10,
      size: 7,
      font: regular,
      color: BLACK,
    });
  }

  const matrixAreaTop = contentTop - headerH;
  const matrixAreaBottom = contentBottom + footerH;
  const matrixMaxW = PAGE_W - MARGIN * 2;
  const matrixMaxH = matrixAreaTop - matrixAreaBottom;
  const scale = Math.min(matrixMaxW / dm.width, matrixMaxH / dm.height);
  const dmW = dm.width * scale;
  const dmH = dm.height * scale;
  page.drawImage(dm, {
    x: MARGIN + (matrixMaxW - dmW) / 2,
    y: matrixAreaBottom + (matrixMaxH - dmH) / 2,
    width: dmW,
    height: dmH,
  });

  const serial =
    cis.includes("21") && cis.length > 18
      ? truncate(cis.replace(/\u001d/g, " ").slice(0, 42), 40)
      : truncate(cis.replace(/\u001d/g, " "), 40);
  const serialW = regular.widthOfTextAtSize(serial, 5.5);
  page.drawText(serial, {
    x: Math.max(MARGIN, (PAGE_W - serialW) / 2),
    y: MARGIN + 4,
    size: 5.5,
    font: regular,
    color: BLACK,
  });

  return Buffer.from(await pdf.save());
}
