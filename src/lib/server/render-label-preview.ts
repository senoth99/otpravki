import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { mmToPoints, mmToPx } from "@/lib/label-media";
import { readPdfPageSizePoints } from "@/lib/label-media";

const execFileAsync = promisify(execFile);
const RENDER_DPI = 150;

/** PNG превью в ориентации самого PDF (альбом → горизонтально). */
export async function renderLabelPdfToPng(pdf: Buffer): Promise<Buffer> {
  const page = readPdfPageSizePoints(pdf);
  const landscape = page ? page.width > page.height + 2 : true;
  const widthMm = landscape ? 150 : 100;
  const heightMm = landscape ? 100 : 150;

  const dir = await mkdtemp(path.join(os.tmpdir(), "box-label-"));
  const pdfPath = path.join(dir, "label.pdf");
  const pngPath = path.join(dir, "label.png");

  try {
    await writeFile(pdfPath, pdf);
    await execFileAsync(
      "gs",
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=pnggray",
        `-r${RENDER_DPI}`,
        `-g${mmToPx(widthMm, RENDER_DPI)}x${mmToPx(heightMm, RENDER_DPI)}`,
        "-dPDFFitPage",
        "-dFIXEDMEDIA",
        `-dDEVICEWIDTHPOINTS=${mmToPoints(widthMm)}`,
        `-dDEVICEHEIGHTPOINTS=${mmToPoints(heightMm)}`,
        "-dFirstPage=1",
        "-dLastPage=1",
        `-sOutputFile=${pngPath}`,
        pdfPath,
      ],
      { timeout: 20_000 },
    );
    return await readFile(pngPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
