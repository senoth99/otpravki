import { execFile } from "child_process";
import { rename, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** CDEK PDF: MediaBox 400×250 pt ≈ 141×88 mm */
const LABEL_WIDTH_MM = "141";
const LABEL_HEIGHT_MM = "88";

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

async function renderWithGhostscript(pdfPath: string, pngPath: string): Promise<boolean> {
  if (!(await commandExists("gs"))) return false;

  try {
    await execFileAsync(
      "gs",
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=pngmono",
        "-r300",
        "-dFirstPage=1",
        "-dLastPage=1",
        `-sOutputFile=${pngPath}`,
        pdfPath,
      ],
      { timeout: 30_000 },
    );
    return true;
  } catch {
    return false;
  }
}

async function renderWithPdftoppm(pdfPath: string, pngBase: string): Promise<string> {
  await execFileAsync(
    "pdftoppm",
    ["-png", "-gray", "-r", "300", "-singlefile", "-cropbox", pdfPath, pngBase],
    { timeout: 30_000 },
  );
  return `${pngBase}.png`;
}

async function flattenToMonochrome(pngPath: string): Promise<void> {
  if (!(await commandExists("convert"))) return;

  try {
    await execFileAsync(
      "convert",
      [pngPath, "-flatten", "-colorspace", "Gray", "-threshold", "50%", pngPath],
      { timeout: 15_000 },
    );
  } catch {
    // optional enhancement
  }
}

async function renderPdfToPng(pdfPath: string, pngPath: string): Promise<void> {
  const pngBase = pngPath.replace(/\.png$/, "");
  const gsOk = await renderWithGhostscript(pdfPath, pngPath);

  if (!gsOk) {
    try {
      const rendered = await renderWithPdftoppm(pdfPath, pngBase);
      if (rendered !== pngPath) {
        await rename(rendered, pngPath);
      }
    } catch {
      throw new Error(
        "Не удалось отрендерить PDF. На сервере: apt install poppler-utils ghostscript",
      );
    }
  }

  await flattenToMonochrome(pngPath);
}

async function runLp(printer: string, file: string, extraArgs: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync("lp", ["-d", printer, ...extraArgs, file], {
    timeout: 30_000,
    env: process.env,
  });
  return stdout.trim();
}

/** Ждём, пока CUPS прочитает файл (lp возвращается сразу после постановки в очередь) */
async function waitForPrintJob(jobInfo: string): Promise<void> {
  const match =
    jobInfo.match(/(?:request id|запрос id|идентификатор запроса)[:\s—-]+\s*(\S+)/i) ??
    jobInfo.match(/(\S+-\d+)\s*$/);
  if (!match) {
    await sleep(8000);
    return;
  }

  const jobId = match[1];
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync("lpstat", ["-W", "completed", "-o", jobId], {
        timeout: 5000,
      });
      if (stdout.includes(jobId)) return;
    } catch {
      // job still processing
    }
    await sleep(500);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PNG_PRINT_OPTS = [
  "-o",
  "fit-to-page",
  "-o",
  "print-color-mode=monochrome",
  "-o",
  `media=Custom.${LABEL_WIDTH_MM}x${LABEL_HEIGHT_MM}mm`,
  "-o",
  "document-format=image/png",
];

const PDF_PRINT_OPTS = [
  "-o",
  "pdfAutoRotate=off",
  "-o",
  "fit-to-page",
  "-o",
  "print-color-mode=monochrome",
  "-o",
  `media=Custom.${LABEL_WIDTH_MM}x${LABEL_HEIGHT_MM}mm`,
];

/** Печать PDF-этикетки СДЭК: рендер в монохром PNG → lp (файл не удаляем до завершения) */
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

  await renderPdfToPng(pdfPath, pngPath);

  const pngAttempts: string[][] = [
    PNG_PRINT_OPTS,
    ["-o", "fit-to-page", "-o", "print-color-mode=monochrome"],
    [],
  ];

  let lastError: Error | null = null;
  for (const opts of pngAttempts) {
    try {
      const job = await runLp(printer, pngPath, opts);
      await waitForPrintJob(job);
      return "png";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("lp png failed");
    }
  }

  for (const opts of [PDF_PRINT_OPTS, ["-o", "fit-to-page"], [] as string[]]) {
    try {
      const job = await runLp(printer, pdfPath, opts);
      await waitForPrintJob(job);
      return "pdf";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("lp pdf failed");
    }
  }

  throw lastError ?? new Error("Не удалось напечатать этикетку");
}
