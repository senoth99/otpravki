import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import {
  labelDpi,
  labelHeightPoints,
  labelHeightPx,
  labelWidthPoints,
  labelWidthPx,
} from "@/lib/label-media";

const execFileAsync = promisify(execFile);
const RENDER_DPI = Math.min(labelDpi(), 150);

/** PNG превью этикетки в размере носителя — тот же fit, что при печати. */
export async function renderLabelPdfToPng(pdf: Buffer): Promise<Buffer> {
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
    return await readFile(pngPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
