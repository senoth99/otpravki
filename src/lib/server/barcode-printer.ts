import { execFile } from "child_process";
import { appendFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { buildLabelHtml } from "@/lib/label-html";
import { buildLabelText, buildLabelTspl, buildLabelZpl } from "@/lib/label-formats";
import { downloadBarcodePdf, resolveBarcodeUrl } from "@/lib/server/orders-api";
import { printPdfLabel } from "@/lib/server/pdf-label-printer";

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");
const LOG_FILE = path.join(DATA_DIR, "print", "log.txt");

const VIRTUAL_PRINTER_RE = /pdf|fax|xps|onenote|save|virtual|document|cups-pdf/i;
const LABEL_PRINTER_RE = /zebra|zdesigner|tsc|te-|xprinter|xp-|godex|g500|barcode|label|dp-?d|ql-|hprt|4barcode|thermal|hotlabel|munbyn|polono|knaon/i;

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

function parseAcceptingPrinters(output: string): string[] {
  return [...output.matchAll(/^(\S+)\s+accepting/gm)].map((m) => m[1]);
}

function parseEnumeratedPrinters(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("printer "));
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

async function listCupsPrinters(): Promise<string[]> {
  const listOut = await runLpstat(["-p"]);
  if (listOut) {
    const printers = parsePrinterList(listOut);
    if (printers.length > 0) return printers;
  }

  const acceptingOut = await runLpstat(["-a"]);
  if (acceptingOut) {
    const printers = parseAcceptingPrinters(acceptingOut);
    if (printers.length > 0) return printers;
  }

  const enumOut = await runLpstat(["-e"]);
  if (enumOut) {
    const printers = parseEnumeratedPrinters(enumOut);
    if (printers.length > 0) return printers;
  }

  return [];
}

const NO_PRINTER_MESSAGE =
  "Принтер не настроен в CUPS. Подключи USB-принтер, выполни ./deploy.sh или lpinfo -v на сервере. Можно указать BARCODE_PRINTER в .env";

/** Находит принтер в CUPS */
export async function detectBarcodePrinter(): Promise<string | null> {
  const fromEnv = process.env.BARCODE_PRINTER?.trim();
  if (fromEnv) return fromEnv;

  if (cachedPrinter !== undefined) return cachedPrinter;

  const defaultOut = await runLpstat(["-d"]);
  const defaultName = defaultOut ? parseDefaultPrinter(defaultOut) : null;
  const printers = await listCupsPrinters();

  if (printers.length > 0) {
    cachedPrinter = pickBestPrinter(printers, defaultName);
    return cachedPrinter;
  }

  cachedPrinter = defaultName && !isVirtualPrinter(defaultName) ? defaultName : null;
  return cachedPrinter;
}

export async function getPrinterDiagnostics(): Promise<{
  printer: string | null;
  defaultPrinter: string | null;
  printers: string[];
  hint: string | null;
}> {
  const defaultOut = await runLpstat(["-d"]);
  const defaultPrinter = defaultOut ? parseDefaultPrinter(defaultOut) : null;
  const printers = await listCupsPrinters();
  const printer = await detectBarcodePrinter();

  return {
    printer,
    defaultPrinter,
    printers,
    hint: printer ? null : NO_PRINTER_MESSAGE,
  };
}

export interface PrintJobResult {
  ok: boolean;
  printer?: string | null;
  format?: string;
  error?: string;
}

async function sendToPrinter(
  printer: string,
  file: string,
  raw: boolean,
): Promise<void> {
  const args = raw
    ? ["-d", printer, "-o", "raw", file]
    : ["-d", printer, file];

  await execFileAsync("lp", args, { timeout: 15_000, env: process.env });
}

export interface PrintLabelOptions {
  orderId?: string;
  barcodeUrl?: string;
  barcodeData?: string;
}

/** Печать этикетки СДЭК (PDF из barcodeUrl) или сгенерированного баркода (мок) */
export async function printToBarcodePrinter(
  orderNumber: string,
  options: PrintLabelOptions = {},
): Promise<PrintJobResult> {
  const printer = await detectBarcodePrinter();
  await mkdir(PRINT_DIR, { recursive: true });

  if (!printer) {
    await logPrint(`FAIL no_printer order=${orderNumber}`);
    return { ok: false, printer: null, error: NO_PRINTER_MESSAGE };
  }

  const labelUrl = resolveBarcodeUrl(options.orderId, options.barcodeUrl);

  if (labelUrl) {
    try {
      const pdf = await downloadBarcodePdf(labelUrl);
      const stamp = `${Date.now()}`;
      const format = await printPdfLabel(printer, pdf, PRINT_DIR, stamp);
      await logPrint(`OK ${format} url=${labelUrl} printer=${printer} order=${orderNumber}`);
      return { ok: true, printer, format };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось напечатать PDF-этикетку";
      await logPrint(`FAIL pdf url=${labelUrl} printer=${printer} ${message}`);
      return { ok: false, printer, error: message };
    }
  }

  let lastError = "Не удалось напечатать на принтере";
  const barcodeData = options.barcodeData ?? orderNumber;
  const attempts: { format: string; ext: string; content: string; raw: boolean }[] = [
    { format: "zpl", ext: "zpl", content: buildLabelZpl(orderNumber, barcodeData), raw: true },
    { format: "tspl", ext: "tspl", content: buildLabelTspl(orderNumber, barcodeData), raw: true },
    { format: "text", ext: "txt", content: buildLabelText(orderNumber, barcodeData), raw: true },
    { format: "html", ext: "html", content: buildLabelHtml(orderNumber, barcodeData), raw: false },
  ];

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
