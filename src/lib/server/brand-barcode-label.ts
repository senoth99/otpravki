import { existsSync } from "fs";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import { printPdfLabel4x6, printPdfLabelPortrait4x6 } from "@/lib/server/pdf-label-printer";
import { buildTrackLabelPdf, sampleTrackLabelInput } from "@/lib/server/track-label-pdf";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");

export type BrandBarcodeKind = "ammo" | "kurazh";
export type TestLabelKind = BrandBarcodeKind | "track";

const TEMPLATE_FILES: Record<BrandBarcodeKind, string> = {
  ammo: "ammo-150x100.pdf",
  kurazh: "kurazh-150x100.pdf",
};

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

export async function printLabelTemplate(printer: string, kind: TestLabelKind): Promise<string> {
  await mkdir(PRINT_DIR, { recursive: true });

  if (kind === "track") {
    const pdf = await buildTrackLabelPdf(sampleTrackLabelInput());
    return printPdfLabelPortrait4x6(printer, pdf, PRINT_DIR, `track-${Date.now()}`);
  }

  const templatePath = resolveLabelTemplate(kind);
  const pdf = await readFile(templatePath);
  return printPdfLabel4x6(printer, pdf, PRINT_DIR, `${kind}-${Date.now()}`);
}

export async function printBrandBarcodeLabel(
  printer: string,
  kind: BrandBarcodeKind,
  _code?: string,
): Promise<void> {
  await printLabelTemplate(printer, kind);
}

export async function printTrackSampleLabel(printer: string): Promise<void> {
  await printLabelTemplate(printer, "track");
}
