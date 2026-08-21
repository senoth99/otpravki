/** Этикетка 150×100: ширина печати 100 мм, длина подачи 150 мм (TSC TE300 4"). */

export function labelWidthMm(): number {
  return Number(process.env.BARCODE_LABEL_WIDTH_MM ?? 100);
}

export function labelHeightMm(): number {
  return Number(process.env.BARCODE_LABEL_HEIGHT_MM ?? 150);
}

export function labelDpi(): number {
  return Number(process.env.BARCODE_LABEL_DPI ?? 300);
}

export function mmToPx(mm: number, dpi = labelDpi()): number {
  return Math.round((mm / 25.4) * dpi);
}

export function mmToPoints(mm: number): number {
  return Math.round((mm / 25.4) * 72);
}

export function labelWidthPx(): number {
  return mmToPx(labelWidthMm());
}

export function labelHeightPx(): number {
  return mmToPx(labelHeightMm());
}

export function labelWidthPoints(): number {
  return mmToPoints(labelWidthMm());
}

export function labelHeightPoints(): number {
  return mmToPoints(labelHeightMm());
}

export function labelMediaOption(): string {
  return `Custom.${labelWidthMm()}x${labelHeightMm()}mm`;
}

export function readPdfPageSizePoints(pdf: Buffer): { width: number; height: number } | null {
  const latin = pdf.toString("latin1");
  const matches = [...latin.matchAll(/\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const width = Math.abs(Number(last[3]) - Number(last[1]));
  const height = Math.abs(Number(last[4]) - Number(last[2]));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return null;
  }
  return { width, height };
}

/** PDF альбомный, этикетка портретная (или наоборот) — нужен поворот на 90°. */
export function pdfNeedsQuarterTurn(pdf: Buffer): boolean {
  const page = readPdfPageSizePoints(pdf);
  if (!page) return false;
  const pdfLandscape = page.width > page.height + 2;
  const labelLandscape = labelWidthMm() > labelHeightMm() + 2;
  return pdfLandscape !== labelLandscape;
}
