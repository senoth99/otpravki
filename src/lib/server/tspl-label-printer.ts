import { execFile } from "child_process";
import { access, readFile, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const RENDER_DPI = Number(process.env.BARCODE_LABEL_DPI ?? 203);
const LABEL_WIDTH_MM = Number(process.env.BARCODE_LABEL_WIDTH_MM ?? 100);
const LABEL_HEIGHT_MM = Number(process.env.BARCODE_LABEL_HEIGHT_MM ?? 150);

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

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** PDF → монохром PBM (1 бит на пиксель) под размер этикетки */
export async function renderPdfToPbm(pdfPath: string, pbmPath: string): Promise<void> {
  if (!(await commandExists("gs"))) {
    throw new Error("Нужен ghostscript: apt install ghostscript");
  }

  await execFileAsync(
    "gs",
    [
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pbmraw",
      `-r${RENDER_DPI}`,
      `-g${labelWidthPx()}x${labelHeightPx()}`,
      "-dPDFFitPage",
      "-dFIXEDMEDIA",
      `-dDEVICEWIDTHPOINTS=${labelWidthPoints()}`,
      `-dDEVICEHEIGHTPOINTS=${labelHeightPoints()}`,
      "-dFirstPage=1",
      "-dLastPage=1",
      `-sOutputFile=${pbmPath}`,
      pdfPath,
    ],
    { timeout: 25_000 },
  );
}

export function parsePbmP4(buffer: Buffer): {
  widthBits: number;
  height: number;
  widthBytes: number;
  bitmap: Buffer;
} {
  let offset = 0;

  const readLine = (): string => {
    const start = offset;
    while (offset < buffer.length && buffer[offset] !== 0x0a) offset += 1;
    const line = buffer.subarray(start, offset).toString("ascii").trim();
    if (offset < buffer.length) offset += 1;
    return line;
  };

  if (readLine() !== "P4") {
    throw new Error("Ожидался PBM P4");
  }

  let dimLine = "";
  while (!dimLine || dimLine.startsWith("#")) {
    dimLine = readLine();
    if (!dimLine) throw new Error("PBM без размеров");
  }

  const [widthBits, height] = dimLine.split(/\s+/).map(Number);
  const widthBytes = Math.ceil(widthBits / 8);
  const expected = widthBytes * height;

  const bitmap = buffer.subarray(offset, offset + expected);
  if (bitmap.length < expected) {
    throw new Error("PBM обрезан");
  }

  return { widthBits, height, widthBytes, bitmap };
}

/** PBM и TSPL используют противоположную полярность битов */
function invertBitmap(data: Buffer): Buffer {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ 0xff;
  }
  return out;
}

export function buildTsplLabel(widthBytes: number, height: number, bitmap: Buffer): Buffer {
  const header = [
    `SIZE ${LABEL_WIDTH_MM} mm,${LABEL_HEIGHT_MM} mm`,
    "GAP 2 mm,0",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
  ].join("\r\n");

  const bitmapCmd = `BITMAP 0,0,${widthBytes},${height},0,`;
  const footer = "\r\nPRINT 1\r\n";

  return Buffer.concat([
    Buffer.from(`${header}\r\n`),
    Buffer.from(bitmapCmd),
    bitmap,
    Buffer.from(footer),
  ]);
}

async function sendRawLp(printer: string, filePath: string): Promise<void> {
  await execFileAsync("lp", ["-d", printer, "-o", "raw", filePath], {
    timeout: 20_000,
    env: process.env,
  });
}

async function sendRawDevice(devicePath: string, data: Buffer): Promise<void> {
  await writeFile(devicePath, data);
}

async function resolveUsbDevice(): Promise<string | null> {
  const fromEnv = process.env.BARCODE_DEVICE?.trim();
  if (fromEnv) return fromEnv;

  for (const dev of ["/dev/usb/lp0", "/dev/usb/lp1"]) {
    try {
      await access(dev);
      return dev;
    } catch {
      // next
    }
  }

  return null;
}

/** TSPL: растр этикетки напрямую на термопринтер */
export async function printTsplLabel(
  printer: string,
  pdfPath: string,
  workDir: string,
  stamp: string,
): Promise<void> {
  const pbmPath = path.join(workDir, `label-${stamp}.pbm`);
  const tsplPath = path.join(workDir, `label-${stamp}.tspl`);

  await renderPdfToPbm(pdfPath, pbmPath);
  const pbm = await readFile(pbmPath);
  const { widthBytes, height, bitmap } = parsePbmP4(pbm);
  const shouldInvert = process.env.BARCODE_INVERT_BITMAP !== "false";
  const raster = shouldInvert ? invertBitmap(bitmap) : bitmap;
  const tspl = buildTsplLabel(widthBytes, height, raster);
  await writeFile(tsplPath, tspl);

  const usb = await resolveUsbDevice();
  if (usb) {
    try {
      await sendRawDevice(usb, tspl);
      return;
    } catch {
      // fallback to lp raw
    }
  }

  await sendRawLp(printer, tsplPath);
}
