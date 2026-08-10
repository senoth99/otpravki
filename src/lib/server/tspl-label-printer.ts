import { execFile } from "child_process";
import { access, readFile, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const RENDER_DPI = Number(process.env.BARCODE_LABEL_DPI ?? 203);
const LABEL_WIDTH_MM = Number(process.env.BARCODE_LABEL_WIDTH_MM ?? 100);
const LABEL_HEIGHT_MM = Number(process.env.BARCODE_LABEL_HEIGHT_MM ?? 150);
const LABEL_SCALE = Number(process.env.BARCODE_LABEL_SCALE ?? 1);
const LABEL_ROTATION = Number(process.env.BARCODE_LABEL_ROTATION ?? 180);

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

  const bitmap = Buffer.from(buffer.subarray(offset, offset + expected));
  if (bitmap.length < expected) {
    throw new Error("PBM обрезан");
  }

  return { widthBits, height, widthBytes, bitmap };
}

type Raster = {
  bitmap: Buffer;
  widthBits: number;
  height: number;
  widthBytes: number;
};

function getBit(bitmap: Buffer, widthBytes: number, x: number, y: number): boolean {
  const byteIndex = y * widthBytes + Math.floor(x / 8);
  const bitIndex = 7 - (x % 8);
  return (bitmap[byteIndex] & (1 << bitIndex)) !== 0;
}

function setBit(bitmap: Buffer, widthBytes: number, x: number, y: number, on: boolean) {
  const byteIndex = y * widthBytes + Math.floor(x / 8);
  const bitIndex = 7 - (x % 8);
  if (on) {
    bitmap[byteIndex] |= 1 << bitIndex;
  } else {
    bitmap[byteIndex] &= ~(1 << bitIndex);
  }
}

function invertBitmap(data: Buffer): Buffer {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ 0xff;
  }
  return out;
}

function scaleBitmap(raster: Raster, factor: number): Raster {
  const newW = Math.max(8, Math.round(raster.widthBits * factor));
  const newH = Math.max(8, Math.round(raster.height * factor));
  const newWB = Math.ceil(newW / 8);
  const out = Buffer.alloc(newWB * newH);

  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(raster.widthBits - 1, Math.floor(x / factor));
      const sy = Math.min(raster.height - 1, Math.floor(y / factor));
      if (getBit(raster.bitmap, raster.widthBytes, sx, sy)) {
        setBit(out, newWB, x, y, true);
      }
    }
  }

  return { bitmap: out, widthBits: newW, height: newH, widthBytes: newWB };
}

function rotateBitmap(raster: Raster, degrees: number): Raster {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) return raster;

  const { widthBits: w, height: h, widthBytes: wb, bitmap } = raster;

  if (normalized === 180) {
    const out = Buffer.alloc(bitmap.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (getBit(bitmap, wb, x, y)) {
          setBit(out, wb, w - 1 - x, h - 1 - y, true);
        }
      }
    }
    return { bitmap: out, widthBits: w, height: h, widthBytes: wb };
  }

  const newW = normalized === 90 || normalized === 270 ? h : w;
  const newH = normalized === 90 || normalized === 270 ? w : h;
  const newWB = Math.ceil(newW / 8);
  const out = Buffer.alloc(newWB * newH);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!getBit(bitmap, wb, x, y)) continue;

      let nx = x;
      let ny = y;
      if (normalized === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (normalized === 270) {
        nx = y;
        ny = w - 1 - x;
      }

      setBit(out, newWB, nx, ny, true);
    }
  }

  return { bitmap: out, widthBits: newW, height: newH, widthBytes: newWB };
}

function prepareRaster(
  raster: Raster,
  invert: boolean,
): Raster & { offsetX: number; offsetY: number } {
  let prepared: Raster = {
    ...raster,
    bitmap: invert ? invertBitmap(raster.bitmap) : Buffer.from(raster.bitmap),
  };

  if (LABEL_SCALE > 0 && LABEL_SCALE !== 1) {
    prepared = scaleBitmap(prepared, LABEL_SCALE);
  }

  if (LABEL_ROTATION !== 0) {
    prepared = rotateBitmap(prepared, LABEL_ROTATION);
  }

  const offsetX = Math.max(0, Math.round((labelWidthPx() - prepared.widthBits) / 2));
  const offsetY = Math.max(0, Math.round((labelHeightPx() - prepared.height) / 2));

  return { ...prepared, offsetX, offsetY };
}

export function buildTsplLabel(
  offsetX: number,
  offsetY: number,
  widthBytes: number,
  height: number,
  bitmap: Buffer,
): Buffer {
  const header = [
    `SIZE ${LABEL_WIDTH_MM} mm,${LABEL_HEIGHT_MM} mm`,
    "GAP 2 mm,0",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
  ].join("\r\n");

  const bitmapCmd = `BITMAP ${offsetX},${offsetY},${widthBytes},${height},0,`;
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
  const parsed = parsePbmP4(pbm);
  const shouldInvert = process.env.BARCODE_INVERT_BITMAP !== "false";
  const raster = prepareRaster(parsed, shouldInvert);

  const tspl = buildTsplLabel(
    raster.offsetX,
    raster.offsetY,
    raster.widthBytes,
    raster.height,
    raster.bitmap,
  );
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
