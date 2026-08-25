import { execFile } from "child_process";
import { rename, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  labelDpi,
  labelHeightPoints,
  labelHeightPx,
  labelMediaOption,
  labelWidthPoints,
  labelWidthPx,
} from "@/lib/label-media";
import { isSatoPrinter, isTscTsplPrinter } from "@/lib/server/printer-kind";
import { printTsplLabel } from "@/lib/server/tspl-label-printer";

const execFileAsync = promisify(execFile);

const RENDER_DPI = labelDpi();
const POST_SPOOL_MS = 300;

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

/**
 * SATO WS408 записки 60×55 (A1: V=55mm H=60mm в SBPL).
 * Gap (IG1) + Tear-off (PM1): иначе continuous/sensor-off с «удлинённой»
 * страницей сбивает pitch — FEED выдаёт пачку, печать стопорится ~70%.
 */
const LABEL_LP_SATO_60X55 = [
  [
    "-o",
    "PageSize=Custom.60x55mm",
    "-o",
    "MediaType=1",
    "-o",
    "saLabelType=1",
    "-o",
    "saOperationMode=1",
    "-o",
    "saThreshold=Default",
    "-o",
    "saYCorrection=0",
    "-o",
    "Darkness=5",
    "-o",
    "saPrintSpeed=3",
    "-o",
    "Resolution=203dpi",
    "-o",
    "print-color-mode=monochrome",
  ],
  [
    "-o",
    "PageSize=Custom.60x55mm",
    "-o",
    "saLabelType=1",
    "-o",
    "saOperationMode=1",
    "-o",
    "saThreshold=Default",
    "-o",
    "Darkness=5",
  ],
  ["-o", "PageSize=Custom.60x55mm", "-o", "saLabelType=1", "-o", "saOperationMode=1"],
  [],
];

/** TSC TE300: 4×6, без полей, вписать по ширине, альбом. */
const LABEL_LP_4X6_LANDSCAPE = [
  [
    "-o",
    "PageSize=w4h6",
    "-o",
    "landscape",
    "-o",
    "fit-to-page",
    "-o",
    "scaling=100",
    "-o",
    "Resolution=300dpi",
  ],
  ["-o", "media=w4h6", "-o", "orientation-requested=4", "-o", "fit-to-page", "-o", "Resolution=300dpi"],
  ["-o", "PageSize=w4h6", "-o", "fit-to-page", "-o", "Resolution=300dpi"],
  ["-o", "PageSize=w288h432", "-o", "fit-to-page"],
  ["-o", `media=${labelMediaOption()}`, "-o", "fit-to-page"],
  ["-o", "fit-to-page"],
  [],
];

/** Портрет 4×6 (100×150) — этикетка трека. */
const LABEL_LP_4X6_PORTRAIT = [
  [
    "-o",
    "PageSize=w4h6",
    "-o",
    "fit-to-page",
    "-o",
    "scaling=100",
    "-o",
    "Resolution=300dpi",
  ],
  ["-o", "media=w4h6", "-o", "fit-to-page", "-o", "Resolution=300dpi"],
  ["-o", "PageSize=w288h432", "-o", "fit-to-page"],
  ["-o", `media=${labelMediaOption()}`, "-o", "fit-to-page"],
  ["-o", "fit-to-page"],
  [],
];

const LABEL_LP_OPTS = [
  ...LABEL_LP_4X6_LANDSCAPE,
  ["-o", `media=${labelMediaOption()}`, "-o", "fit-to-page"],
  ["-o", "fit-to-page"],
  [],
];

export type LabelPrintFormat = "tspl" | "pdf" | "png";

function cupsOptionSetsForPrinter(printer: string, landscape: boolean): string[][] {
  if (isSatoPrinter(printer)) return LABEL_LP_SATO_60X55;
  return landscape ? LABEL_LP_4X6_LANDSCAPE : LABEL_LP_4X6_PORTRAIT;
}

async function printPdfViaCups(
  printer: string,
  pdfPath: string,
  optionSets: string[][],
): Promise<boolean> {
  for (const opts of optionSets) {
    try {
      await runLp(printer, pdfPath, opts);
      await sleep(POST_SPOOL_MS);
      return true;
    } catch {
      // next
    }
  }
  return false;
}

async function tryPrintTspl(
  printer: string,
  pdfPath: string,
  workDir: string,
  stamp: string,
): Promise<boolean> {
  if (!isTscTsplPrinter(printer)) return false;
  try {
    await printTsplLabel(printer, pdfPath, workDir, stamp);
    await sleep(POST_SPOOL_MS);
    return true;
  } catch {
    return false;
  }
}

/** Этикетка 60×55 на SATO WS408 (записки / честные знаки). */
export async function printPdfSato60x55(
  printer: string,
  pdf: Buffer,
  workDir: string,
  stamp: string,
): Promise<LabelPrintFormat> {
  assertPdfBuffer(pdf);
  const pdfPath = path.join(workDir, `sato60-${stamp}.pdf`);
  await writeFile(pdfPath, pdf);

  if (await printPdfViaCups(printer, pdfPath, LABEL_LP_SATO_60X55)) {
    return "pdf";
  }
  throw new Error("Не удалось напечатать этикетку 60×55 на SATO");
}

/** @deprecated alias — записки */
export async function printPdfGiftNote(
  printer: string,
  pdf: Buffer,
  workDir: string,
  stamp: string,
): Promise<LabelPrintFormat> {
  return printPdfSato60x55(printer, pdf, workDir, stamp);
}

/** Макеты 4×6 landscape. TSPL только на TSC; иначе CUPS (SATO и др.). */
export async function printPdfLabel4x6(
  printer: string,
  pdf: Buffer,
  workDir: string,
  stamp: string,
): Promise<LabelPrintFormat> {
  assertPdfBuffer(pdf);
  const pdfPath = path.join(workDir, `label-${stamp}.pdf`);
  await writeFile(pdfPath, pdf);

  if (await tryPrintTspl(printer, pdfPath, workDir, stamp)) return "tspl";
  if (await printPdfViaCups(printer, pdfPath, cupsOptionSetsForPrinter(printer, true))) {
    return "pdf";
  }
  throw new Error("Не удалось напечатать этикетку 4×6");
}

/** Этикетка трека: портрет 100×150, без landscape. */
export async function printPdfLabelPortrait4x6(
  printer: string,
  pdf: Buffer,
  workDir: string,
  stamp: string,
): Promise<LabelPrintFormat> {
  assertPdfBuffer(pdf);
  const pdfPath = path.join(workDir, `label-${stamp}.pdf`);
  await writeFile(pdfPath, pdf);

  if (await tryPrintTspl(printer, pdfPath, workDir, stamp)) return "tspl";
  if (await printPdfViaCups(printer, pdfPath, cupsOptionSetsForPrinter(printer, false))) {
    return "pdf";
  }
  throw new Error("Не удалось напечатать этикетку трека");
}

/** Печать этикетки 150×100: TSPL raw → PDF 4×6 → PNG */
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

  if (isTscTsplPrinter(printer)) {
    try {
      await printTsplLabel(printer, pdfPath, workDir, stamp);
      await sleep(POST_SPOOL_MS);
      return "tspl";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("tspl failed");
    }
  }

  const cupsOpts = isSatoPrinter(printer) ? LABEL_LP_SATO_60X55 : LABEL_LP_OPTS;

  for (const opts of cupsOpts) {
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
    for (const opts of cupsOpts) {
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
