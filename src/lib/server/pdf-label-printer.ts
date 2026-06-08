import { execFile } from "child_process";
import { rename, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const RENDER_DPI = "203";
const POST_SPOOL_MS = 2500;

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
    ["-png", "-gray", "-r", RENDER_DPI, "-singlefile", "-cropbox", pdfPath, pngBase],
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
    try {
      await renderWithPdftoppm(pdfPath, pngPath);
    } catch {
      throw new Error(
        "Не удалось отрендерить PDF. На сервере: apt install poppler-utils ghostscript",
      );
    }
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

/** Печать PDF-этикетки СДЭК */
export async function printPdfLabel(
  printer: string,
  pdf: Buffer,
  workDir: string,
  stamp: string,
): Promise<"png" | "pdf"> {
  assertPdfBuffer(pdf);

  const pdfPath = path.join(workDir, `label-${stamp}.pdf`);
  const pngPath = path.join(workDir, `label-${stamp}.png`);
  await writeFile(pdfPath, pdf);

  let pngReady = false;
  try {
    await renderPdfToPng(pdfPath, pngPath);
    pngReady = true;
  } catch {
    pngReady = false;
  }

  if (pngReady) {
    const pngAttempts: string[][] = [
      [],
      ["-o", "fit-to-page"],
      ["-o", "print-color-mode=monochrome"],
      ["-o", "fit-to-page", "-o", "print-color-mode=monochrome"],
    ];

    let lastPngError: Error | null = null;
    for (const opts of pngAttempts) {
      try {
        await runLp(printer, pngPath, opts);
        await sleep(POST_SPOOL_MS);
        return "png";
      } catch (error) {
        lastPngError = error instanceof Error ? error : new Error("lp png failed");
      }
    }

    if (lastPngError) {
      // fall through to PDF
    }
  }

  const pdfAttempts: string[][] = [
    [],
    ["-o", "fit-to-page"],
    ["-o", "pdfAutoRotate=off", "-o", "fit-to-page"],
  ];

  let lastError: Error | null = null;
  for (const opts of pdfAttempts) {
    try {
      await runLp(printer, pdfPath, opts);
      await sleep(POST_SPOOL_MS);
      return "pdf";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("lp pdf failed");
    }
  }

  throw lastError ?? new Error("Не удалось отправить этикетку на принтер");
}
