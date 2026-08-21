import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { labelHeightMm, labelWidthMm, labelWidthPx } from "@/lib/label-media";
import { sendRawTspl } from "@/lib/server/tspl-label-printer";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");

export type BrandBarcodeKind = "ammo" | "kurazh";
export type TestLabelKind = BrandBarcodeKind | "track";

const FONT_DOT_WIDTH: Record<string, number> = {
  "1": 8,
  "2": 12,
  "3": 16,
  "4": 24,
  "5": 32,
};

function tsplEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function centerTextX(text: string, font: string, mag: number): number {
  const glyph = FONT_DOT_WIDTH[font] ?? 16;
  const width = glyph * mag * text.length;
  return Math.max(16, Math.round((labelWidthPx() - width) / 2));
}

function estimateCode128Width(data: string, narrow: number): number {
  return (11 * (data.length + 1) + 13) * narrow;
}

function centerBarcodeX(data: string, narrow: number): number {
  const width = estimateCode128Width(data, narrow);
  return Math.max(16, Math.round((labelWidthPx() - width) / 2));
}

export function brandNeedsSecondBarcode(brand?: string): boolean {
  const value = (brand ?? "").trim().toLowerCase();
  if (!value) return false;
  return (
    value === "ammo" ||
    value === "ammd" ||
    value === "kurazhdvizh" ||
    value === "kurazh" ||
    value.includes("кураж") ||
    value.includes("ammo")
  );
}

export function brandBarcodeKindFromStore(brand?: string): BrandBarcodeKind | null {
  if (!brandNeedsSecondBarcode(brand)) return null;
  const value = (brand ?? "").trim().toLowerCase();
  if (value === "ammo" || value === "ammd" || value.includes("ammo")) return "ammo";
  return "kurazh";
}

function buildFilledBarcodeTspl(options: {
  title: string;
  code: string;
  footer: string;
}): string {
  const code = options.code.replace(/[^\x20-\x7E]/g, "").trim() || "TEST";
  const title = options.title.replace(/[^\x20-\x7E]/g, "").trim() || "LABEL";
  const footer = options.footer.replace(/[^\x20-\x7E]/g, "").trim() || code;
  const titleFont = title.length > 8 ? "4" : "5";
  const titleMag = title.length > 10 ? 2 : 3;
  const narrow = code.length > 16 ? 2 : 3;
  const barcodeHeight = 780;
  const barcodeY = 220;

  return [
    `SIZE ${labelWidthMm()} mm,${labelHeightMm()} mm`,
    "GAP 2 mm,0",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
    `TEXT ${centerTextX(title, titleFont, titleMag)},40,"${titleFont}",0,${titleMag},${titleMag},"${tsplEscape(title)}"`,
    `BARCODE ${centerBarcodeX(code, narrow)},${barcodeY},"128",${barcodeHeight},0,0,${narrow},${narrow * 2},"${tsplEscape(code)}"`,
    `TEXT ${centerTextX(footer, "3", 2)},${barcodeY + barcodeHeight + 30},"3",0,2,2,"${tsplEscape(footer)}"`,
    "PRINT 1,1",
    "",
  ].join("\r\n");
}

export function buildBrandBarcodeTspl(kind: BrandBarcodeKind, code: string): string {
  if (kind === "ammo") {
    return buildFilledBarcodeTspl({
      title: "AMMO",
      code,
      footer: code,
    });
  }
  return buildFilledBarcodeTspl({
    title: "KURAZHDVIZH",
    code,
    footer: code,
  });
}

export function buildTrackBarcodeTspl(code: string): string {
  return buildFilledBarcodeTspl({
    title: "CDEK TRACK",
    code,
    footer: code,
  });
}

export function testLabelSample(kind: TestLabelKind): { title: string; code: string; tspl: string } {
  if (kind === "ammo") {
    return { title: "AMMO", code: "AMMO-TEST", tspl: buildBrandBarcodeTspl("ammo", "AMMO-TEST") };
  }
  if (kind === "kurazh") {
    return {
      title: "KURAZHDVIZH",
      code: "KURAZH-TEST",
      tspl: buildBrandBarcodeTspl("kurazh", "KURAZH-TEST"),
    };
  }
  return {
    title: "CDEK TRACK",
    code: "12345678901234",
    tspl: buildTrackBarcodeTspl("12345678901234"),
  };
}

export async function printTsplCommands(printer: string, tspl: string, stamp: string): Promise<void> {
  await mkdir(PRINT_DIR, { recursive: true });
  const file = path.join(PRINT_DIR, `brand-${stamp}.tspl`);
  const payload = Buffer.from(tspl, "utf-8");
  await writeFile(file, payload);
  await sendRawTspl(printer, file, payload);
}

export async function printBrandBarcodeLabel(
  printer: string,
  kind: BrandBarcodeKind,
  code: string,
): Promise<void> {
  await printTsplCommands(printer, buildBrandBarcodeTspl(kind, code), `${kind}-${Date.now()}`);
}

export async function printTrackBarcodeLabel(printer: string, code: string): Promise<void> {
  await printTsplCommands(printer, buildTrackBarcodeTspl(code), `track-${Date.now()}`);
}
