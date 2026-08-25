import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { mmToPoints, readPdfPageSizePoints } from "@/lib/label-media";

const execFileAsync = promisify(execFile);
const RENDER_DPI = 150;

/** PNG превью в ориентации и размере самого PDF. */
export async function renderLabelPdfToPng(pdf: Buffer): Promise<Buffer> {
  const page = readPdfPageSizePoints(pdf);
  const widthPt = page?.width ?? mmToPoints(60);
  const heightPt = page?.height ?? mmToPoints(55);
  const widthPx = Math.max(1, Math.round((widthPt / 72) * RENDER_DPI));
  const heightPx = Math.max(1, Math.round((heightPt / 72) * RENDER_DPI));

  const dir = await mkdtemp(path.join(os.tmpdir(), "label-preview-"));
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
        `-g${widthPx}x${heightPx}`,
        "-dPDFFitPage",
        "-dFIXEDMEDIA",
        `-dDEVICEWIDTHPOINTS=${widthPt}`,
        `-dDEVICEHEIGHTPOINTS=${heightPt}`,
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
