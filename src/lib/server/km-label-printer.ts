import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  buildKmLabelText,
  buildKmLabelTspl,
  buildKmLabelZpl,
} from "@/lib/km-label-formats";
import { detectBarcodePrinter } from "@/lib/server/barcode-printer";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRINT_DIR = path.join(DATA_DIR, "print");

async function sendRaw(printer: string, file: string): Promise<void> {
  await execFileAsync("lp", ["-d", printer, "-o", "raw", file], {
    timeout: 15_000,
    env: process.env,
  });
}

export async function printKmLabel(km: {
  cis: string;
  gtin?: string;
}): Promise<{ ok: boolean; printer?: string | null; error?: string }> {
  const printer = await detectBarcodePrinter();
  if (!printer) {
    return { ok: false, printer: null, error: "Принтер не настроен" };
  }

  await mkdir(PRINT_DIR, { recursive: true });
  const attempts = [
    { ext: "zpl", content: buildKmLabelZpl(km), raw: true },
    { ext: "tspl", content: buildKmLabelTspl(km), raw: true },
    { ext: "txt", content: buildKmLabelText(km), raw: true },
  ];

  let lastError = "Не удалось напечатать";
  for (const attempt of attempts) {
    const file = path.join(PRINT_DIR, `km-${Date.now()}.${attempt.ext}`);
    try {
      await writeFile(file, attempt.content, "utf-8");
      await sendRaw(printer, file);
      return { ok: true, printer };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  return { ok: false, printer, error: lastError };
}
