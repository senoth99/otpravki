import { execFile } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { buildLabelHtml } from "@/lib/label-html";

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");

const VIRTUAL_PRINTER_RE = /pdf|fax|xps|onenote|save|virtual|document/i;

let cachedPrinter: string | null | undefined;

function isVirtualPrinter(name: string) {
  return VIRTUAL_PRINTER_RE.test(name);
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

/** Находит единственный / дефолтный принтер в CUPS */
export async function detectBarcodePrinter(): Promise<string | null> {
  const fromEnv = process.env.BARCODE_PRINTER?.trim();
  if (fromEnv) return fromEnv;

  if (cachedPrinter !== undefined) return cachedPrinter;

  const defaultOut = await runLpstat(["-d"]);
  if (defaultOut) {
    const defaultPrinter = parseDefaultPrinter(defaultOut);
    if (defaultPrinter && !isVirtualPrinter(defaultPrinter)) {
      cachedPrinter = defaultPrinter;
      return cachedPrinter;
    }
  }

  const listOut = await runLpstat(["-p"]);
  if (listOut) {
    const printers = parsePrinterList(listOut).filter((p) => !isVirtualPrinter(p));
    if (printers.length === 1) {
      cachedPrinter = printers[0];
      return cachedPrinter;
    }
    if (printers.length > 1) {
      // несколько — берём дефолтный из списка или первый физический
      const defaultName = defaultOut ? parseDefaultPrinter(defaultOut) : null;
      if (defaultName && printers.includes(defaultName)) {
        cachedPrinter = defaultName;
        return cachedPrinter;
      }
      cachedPrinter = printers[0];
      return cachedPrinter;
    }
  }

  cachedPrinter = null;
  return null;
}

export async function isBarcodePrinterAvailable(): Promise<boolean> {
  const printer = await detectBarcodePrinter();
  if (printer) return true;

  // lp без -d сработает, если в системе один принтер
  try {
    await execFileAsync("lpstat", ["-r"], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Прямая печать на принтер через CUPS — без диалога и вкладок */
export async function printToBarcodePrinter(
  orderNumber: string,
  barcodeData: string,
): Promise<boolean> {
  const printer = await detectBarcodePrinter();

  await mkdir(PRINT_DIR, { recursive: true });
  const file = path.join(PRINT_DIR, `label-${Date.now()}.html`);
  await writeFile(file, buildLabelHtml(orderNumber, barcodeData), "utf-8");

  try {
    if (printer) {
      await execFileAsync("lp", ["-d", printer, file], { timeout: 15_000 });
    } else {
      await execFileAsync("lp", [file], { timeout: 15_000 });
    }
    return true;
  } catch {
    cachedPrinter = undefined;
    return false;
  }
}
