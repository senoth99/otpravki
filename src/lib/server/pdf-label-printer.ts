import { execFile } from "child_process";
import { unlink, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const LABEL_PRINTER_RE = /zebra|zdesigner|tsc|te-|xprinter|xp-|godex|g500|barcode|label|dp-?d|ql-|hprt|4barcode|thermal/i;

export function isLabelPrinterName(name: string): boolean {
  return LABEL_PRINTER_RE.test(name);
}

export function assertPdfBuffer(data: Buffer): void {
  if (data.length < 5 || data.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Ответ barcodeUrl не является PDF-файлом");
  }
}

async function runLp(printer: string, file: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync("lp", ["-d", printer, ...extraArgs, file], {
    timeout: 30_000,
    env: process.env,
  });
}

async function convertPdfToPng(pdfPath: string, outBase: string): Promise<string> {
  await execFileAsync(
    "pdftoppm",
    ["-png", "-r", "203", "-singlefile", pdfPath, outBase],
    { timeout: 30_000 },
  );
  return `${outBase}.png`;
}

/** Печать PDF-этикетки СДЭК: на термопринтере — через PNG, иначе — PDF */
export async function printPdfLabel(
  printer: string,
  pdf: Buffer,
  workDir: string,
  stamp: string,
): Promise<"pdf" | "png"> {
  assertPdfBuffer(pdf);

  const pdfPath = path.join(workDir, `label-${stamp}.pdf`);
  await writeFile(pdfPath, pdf);

  const useImage = isLabelPrinterName(printer);

  if (useImage) {
    const pngBase = path.join(workDir, `label-${stamp}`);
    let pngPath: string;
    try {
      pngPath = await convertPdfToPng(pdfPath, pngBase);
    } catch {
      throw new Error(
        "Для термопринтера нужен pdftoppm — на сервере: apt install poppler-utils",
      );
    }
    try {
      await runLp(printer, pngPath, ["-o", "fit-to-page"]);
      return "png";
    } finally {
      await unlink(pngPath).catch(() => undefined);
    }
  }

  const pdfAttempts: string[][] = [
    ["-o", "fit-to-page", "-o", "media=Custom.58x40mm"],
    ["-o", "fit-to-page", "-o", "media=4x6"],
    ["-o", "fit-to-page"],
    [],
  ];

  let lastError: Error | null = null;
  for (const opts of pdfAttempts) {
    try {
      await runLp(printer, pdfPath, opts);
      return "pdf";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("lp failed");
    }
  }

  throw lastError ?? new Error("Не удалось отправить PDF на принтер");
}
