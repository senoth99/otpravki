import { existsSync } from "fs";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import { printPdfLabel4x6 } from "@/lib/server/pdf-label-printer";
import {
  buildTrackLabelPdf,
  sampleTrackLabelInput,
  type TestTrackBrand,
} from "@/lib/server/track-label-pdf";
import {
  brandBarcodeKindFromStore,
  brandNeedsSecondBarcode,
  type BrandBarcodeKind,
} from "@/lib/brand-second-label";

export { brandBarcodeKindFromStore, brandNeedsSecondBarcode, type BrandBarcodeKind };
export type { TestTrackBrand };

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");

export type TestPrintKind = "brand" | "track";
/** @deprecated use TestPrintKind + brand */
export type TestLabelKind = BrandBarcodeKind | "track";

const TEMPLATE_FILES: Record<BrandBarcodeKind, string> = {
  ammo: "ammo-150x100.pdf",
  kurazh: "kurazh-150x100.pdf",
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

export function resolveLabelTemplate(kind: BrandBarcodeKind): string {
  const file = TEMPLATE_FILES[kind];
  for (const dir of labelsDirCandidates()) {
    const full = path.join(dir, file);
    if (existsSync(full)) return full;
  }
  throw new Error(`Нет макета ${file} в labels/`);
}

export function parseTestBrand(value: unknown): TestTrackBrand | null {
  if (value === "casher" || value === "ammo" || value === "kurazh" || value === "shecash") {
    return value;
  }
  return null;
}

export async function printTestLabel(
  printer: string,
  kind: TestPrintKind,
  brand: TestTrackBrand,
): Promise<string> {
  await mkdir(PRINT_DIR, { recursive: true });

  if (kind === "track") {
    const pdf = await buildTrackLabelPdf(sampleTrackLabelInput(brand));
    return printPdfLabel4x6(printer, pdf, PRINT_DIR, `track-${brand}-${Date.now()}`);
  }

  if (brand === "casher" || brand === "shecash") {
    throw new Error("У этого бренда нет отдельной бренд-этикетки — только трек");
  }

  const templatePath = resolveLabelTemplate(brand);
  const pdf = await readFile(templatePath);
  return printPdfLabel4x6(printer, pdf, PRINT_DIR, `${brand}-${Date.now()}`);
}

/** Совместимость со старым API kind=ammo|kurazh|track */
export async function printLabelTemplate(printer: string, kind: TestLabelKind): Promise<string> {
  if (kind === "track") return printTestLabel(printer, "track", "casher");
  return printTestLabel(printer, "brand", kind);
}

export async function printBrandBarcodeLabel(
  printer: string,
  kind: BrandBarcodeKind,
  _code?: string,
): Promise<void> {
  await printTestLabel(printer, "brand", kind);
}

export async function printTrackSampleLabel(
  printer: string,
  brand: TestTrackBrand = "casher",
): Promise<void> {
  await printTestLabel(printer, "track", brand);
}
