import { execFile } from "child_process";
import { appendFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { buildLabelHtml } from "@/lib/label-html";
import { buildLabelText, buildLabelTspl, buildLabelZpl } from "@/lib/label-formats";

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");
const LOG_FILE = path.join(DATA_DIR, "print", "log.txt");

const VIRTUAL_PRINTER_RE = /pdf|fax|xps|onenote|save|virtual|document|cups-pdf/i;
const LABEL_PRINTER_RE = /zebra|zdesigner|tsc|te-|xprinter|xp-|godex|g500|barcode|label|dp-?d|ql-|hprt|4barcode/i;

let cachedPrinter: string | null | undefined;

function isVirtualPrinter(name: string) {
  return VIRTUAL_PRINTER_RE.test(name);
}

function isLabelPrinter(name: string) {
  return LABEL_PRINTER_RE.test(name);
}

function parsePrinterList(output: string): string[] {
  return [...output.matchAll(/^printer\s+(\S+)/gm)].map((m) => m[1]);
}

function parseDefaultPrinter(output: string): string | null {
  const match =
    output.match(/system default destination:\s*(.+)/i) ??
    output.match(/назначение по умолчанию:\s*(.+)/i);
  if (!match) return null;

  const name = match[1].trim();
  if (!name || /^нет|none$/i.test(name)) return null;
  return name;
}

async function runLpstat(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("lpstat", args, { timeout: 5000 });
    return stdout;
  } catch {
    return null;
  }
}

async function logPrint(message: string) {
  try {
    await mkdir(PRINT_DIR, { recursive: true });
    await appendFile(LOG_FILE, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // ignore log errors
  }
}

function pickBestPrinter(printers: string[], defaultName: string | null): string | null {
  const physical = printers.filter((p) => !isVirtualPrinter(p));
  if (physical.length === 0) return null;

  const labelPrinters = physical.filter(isLabelPrinter);
  if (labelPrinters.length === 1) return labelPrinters[0];
  if (labelPrinters.length > 1 && defaultName && labelPrinters.includes(defaultName)) {
    return defaultName;
  }
  if (labelPrinters.length > 1) return labelPrinters[0];

  if (physical.length === 1) return physical[0];
  if (defaultName && physical.includes(defaultName)) return defaultName;
  return physical[0];
}

/** Находит принтер в CUPS */
export async function detectBarcodePrinter(): Promise<string | null> {
  const fromEnv = process.env.BARCODE_PRINTER?.trim();
  if (fromEnv) return fromEnv;

  if (cachedPrinter !== undefined) return cachedPrinter;

  const defaultOut = await runLpstat(["-d"]);
  const defaultName = defaultOut ? parseDefaultPrinter(defaultOut) : null;
  const listOut = await runLpstat(["-p"]);

  if (listOut) {
    cachedPrinter = pickBestPrinter(parsePrinterList(listOut), defaultName);
    return cachedPrinter;
  }

  cachedPrinter = defaultName && !isVirtualPrinter(defaultName) ? defaultName : null;
  return cachedPrinter;
}

export interface PrintJobResult {
  ok: boolean;
  printer?: string | null;
  format?: string;
  error?: string;
}

async function sendToPrinter(
  printer: string | null,
  file: string,
  raw: boolean,
): Promise<void> {
  const args = printer
    ? raw
      ? ["-d", printer, "-o", "raw", file]
      : ["-d", printer, file]
    : raw
      ? ["-o", "raw", file]
      : [file];

  await execFileAsync("lp", args, { timeout: 15_000, env: process.env });
}

/** Прямая печать на термопринтер */
export async function printToBarcodePrinter(
  orderNumber: string,
  barcodeData: string,
): Promise<PrintJobResult> {
  const printer = await detectBarcodePrinter();
  await mkdir(PRINT_DIR, { recursive: true });

  const attempts: { format: string; ext: string; content: string; raw: boolean }[] = [
    { format: "zpl", ext: "zpl", content: buildLabelZpl(orderNumber, barcodeData), raw: true },
    { format: "tspl", ext: "tspl", content: buildLabelTspl(orderNumber, barcodeData), raw: true },
    { format: "text", ext: "txt", content: buildLabelText(orderNumber, barcodeData), raw: true },
    { format: "html", ext: "html", content: buildLabelHtml(orderNumber, barcodeData), raw: false },
  ];

  let lastError = "Принтер не найден или CUPS не запущен";

  for (const attempt of attempts) {
    const file = path.join(PRINT_DIR, `label-${Date.now()}.${attempt.ext}`);
    try {
      await writeFile(file, attempt.content, "utf-8");
      await sendToPrinter(printer, file, attempt.raw);
      await logPrint(`OK ${attempt.format} printer=${printer ?? "default"} order=${orderNumber}`);
      return { ok: true, printer, format: attempt.format };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : `Ошибка печати (${attempt.format})`;
      await logPrint(`FAIL ${attempt.format} printer=${printer ?? "default"} ${lastError}`);
    }
  }

  cachedPrinter = undefined;
  return { ok: false, printer, error: lastError };
}
