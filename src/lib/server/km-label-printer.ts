import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  buildKmLabelText,
  buildKmLabelTspl,
  buildKmLabelZpl,
} from "@/lib/km-label-formats";
import {
  detectBarcodePrinter,
  detectGiftNotePrinter,
} from "@/lib/server/barcode-printer";
import { buildKmLabelPdf, buildSampleKmCis } from "@/lib/server/km-label-pdf";
import { isSatoPrinter, isTscTsplPrinter } from "@/lib/server/printer-kind";
import { printPdfSato60x55 } from "@/lib/server/pdf-label-printer";
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

async function resolveKmPrinter(requested?: string | null): Promise<string | null> {
  if (requested?.trim()) return requested.trim();
  // ЧЗ и записки — на WS408 60×55; иначе TSC.
  return (await detectGiftNotePrinter()) ?? (await detectBarcodePrinter());
}

export async function printKmLabel(km: {
  cis: string;
  gtin?: string;
  productName?: string;
  brandId?: string;
  title?: string;
  printer?: string | null;
}): Promise<{ ok: boolean; printer?: string | null; format?: string; error?: string }> {
  const printer = await resolveKmPrinter(km.printer);
  if (!printer) {
    return { ok: false, printer: null, error: "Принтер не настроен" };
  }

  await mkdir(PRINT_DIR, { recursive: true });
  const stamp = `km-${Date.now()}`;

  const brandId =
    km.brandId === "casher" ||
    km.brandId === "ammo" ||
    km.brandId === "kurazh" ||
    km.brandId === "shecash"
      ? km.brandId
      : undefined;

  if (isSatoPrinter(printer) || !isTscTsplPrinter(printer)) {
    try {
      const pdf = await buildKmLabelPdf({
        cis: km.cis,
        gtin: km.gtin,
        productName: km.productName,
        brandId,
        title: km.title,
      });
      const format = await printPdfSato60x55(printer, pdf, PRINT_DIR, stamp);
      return { ok: true, printer, format };
    } catch (error) {
      if (isSatoPrinter(printer)) {
        return {
          ok: false,
          printer,
          error: error instanceof Error ? error.message : "Ошибка печати PDF на SATO",
        };
      }
    }
  }

  const attempts = [
    { ext: "tspl", content: buildKmLabelTspl(km) },
    { ext: "zpl", content: buildKmLabelZpl(km) },
    { ext: "txt", content: buildKmLabelText(km) },
  ];

  let lastError = "Не удалось напечатать";
  for (const attempt of attempts) {
    const file = path.join(PRINT_DIR, `${stamp}.${attempt.ext}`);
    try {
      await writeFile(file, attempt.content, "utf-8");
      await sendRaw(printer, file);
      return { ok: true, printer, format: attempt.ext };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  return { ok: false, printer, error: lastError };
}

/** Тест-печать сгенерированного КМ на принтер записок/ЧЗ (WS408). */
export async function printTestKmLabel(printer?: string | null): Promise<{
  ok: boolean;
  printer?: string | null;
  format?: string;
  gtin?: string;
  error?: string;
}> {
  const sample = buildSampleKmCis();
  const result = await printKmLabel({
    ...sample,
    printer,
  });
  return { ...result, gtin: sample.gtin };
}
