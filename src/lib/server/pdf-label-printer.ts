import { execFile } from "child_process";
import { rename, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { printTsplLabel } from "@/lib/server/tspl-label-printer";

const execFileAsync = promisify(execFile);

const RENDER_DPI = Number(process.env.BARCODE_LABEL_DPI ?? 203);
const LABEL_WIDTH_MM = Number(process.env.BARCODE_LABEL_WIDTH_MM ?? 100);
const LABEL_HEIGHT_MM = Number(process.env.BARCODE_LABEL_HEIGHT_MM ?? 150);
const POST_SPOOL_MS = 2500;

function labelWidthPoints(): number {
  return Math.round((LABEL_WIDTH_MM / 25.4) * 72);
}

function labelHeightPoints(): number {
  return Math.round((LABEL_HEIGHT_MM / 25.4) * 72);
}

function labelWidthPx(): number {
  return Math.round((LABEL_WIDTH_MM / 25.4) * RENDER_DPI);
}

function labelHeightPx(): number {
  return Math.round((LABEL_HEIGHT_MM / 25.4) * RENDER_DPI);
}

function labelMediaOption(): string {
  return `Custom.${LABEL_WIDTH_MM}x${LABEL_HEIGHT_MM}mm`;
}

export function assertPdfBuffer(data: Buffer): void {
  if (data.length < 5 || data.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Ответ barcodeUrl не является PDF-файлом");
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function fileHasContent(filePath: string, minBytes = 500): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.size >= minBytes;
  } catch {
    return false;
  }
}

async function renderWithGhostscript(pdfPath: string, pngPath: string): Promise<boolean> {
  if (!(await commandExists("gs"))) return false;

  try {
    await execFileAsync(
      "gs",
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=pnggray",
        `-r${RENDER_DPI}`,
        `-g${labelWidthPx()}x${labelHeightPx()}`,
        "-dPDFFitPage",
        "-dFIXEDMEDIA",
        `-dDEVICEWIDTHPOINTS=${labelWidthPoints()}`,
        `-dDEVICEHEIGHTPOINTS=${labelHeightPoints()}`,
        "-dFirstPage=1",
        "-dLastPage=1",
        `-sOutputFile=${pngPath}`,
        pdfPath,
      ],
      { timeout: 20_000 },
    );
    return fileHasContent(pngPath);
  } catch {
    return false;
  }
}

async function renderWithPdftoppm(pdfPath: string, pngPath: string): Promise<void> {
  const pngBase = pngPath.replace(/\.png$/, "");
  await execFileAsync(
    "pdftoppm",
    [
      "-png",
      "-gray",
      "-r",
      String(RENDER_DPI),
      "-singlefile",
      "-cropbox",
      "-scale-to",
      String(Math.max(labelWidthPx(), labelHeightPx())),
      pdfPath,
      pngBase,
    ],
    { timeout: 20_000 },
  );

  const rendered = `${pngBase}.png`;
  if (rendered !== pngPath) {
    await rename(rendered, pngPath);
  }

  if (!(await fileHasContent(pngPath))) {
    throw new Error("pdftoppm создал пустой файл");
  }
}

async function renderPdfToPng(pdfPath: string, pngPath: string): Promise<void> {
  const gsOk = await renderWithGhostscript(pdfPath, pngPath);
  if (!gsOk) {
    await renderWithPdftoppm(pdfPath, pngPath);
  }
}

async function runLp(printer: string, file: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync("lp", ["-d", printer, ...extraArgs, file], {
    timeout: 15_000,
    env: process.env,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LABEL_LP_OPTS = [
  ["-o", `media=${labelMediaOption()}`, "-o", "fit-to-page"],
  ["-o", "media=4x6", "-o", "fit-to-page"],
  ["-o", "fit-to-page"],
  [],
];

export type LabelPrintFormat = "tspl" | "pdf" | "png";

/** Печать этикетки 100×150: TSPL raw → PDF → PNG */
export async function printPdfLabel(
  printer: string,
  pdf: Buffer,
  workDir: string,
  stamp: string,
): Promise<LabelPrintFormat> {
  assertPdfBuffer(pdf);

  const pdfPath = path.join(workDir, `label-${stamp}.pdf`);
  const pngPath = path.join(workDir, `label-${stamp}.png`);
  await writeFile(pdfPath, pdf);

  let lastError: Error | null = null;

  try {
    await printTsplLabel(printer, pdfPath, workDir, stamp);
    await sleep(POST_SPOOL_MS);
    return "tspl";
  } catch (error) {
    lastError = error instanceof Error ? error : new Error("tspl failed");
  }

  for (const opts of LABEL_LP_OPTS) {
    try {
      await runLp(printer, pdfPath, opts);
      await sleep(POST_SPOOL_MS);
      return "pdf";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("lp pdf failed");
    }
  }

  try {
    await renderPdfToPng(pdfPath, pngPath);
    for (const opts of LABEL_LP_OPTS) {
      try {
        await runLp(printer, pngPath, opts);
        await sleep(POST_SPOOL_MS);
        return "png";
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("lp png failed");
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error("render failed");
  }

  throw lastError ?? new Error("Не удалось отправить этикетку на принтер");
}
