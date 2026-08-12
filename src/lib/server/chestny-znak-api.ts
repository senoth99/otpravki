import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface CrptTokenResult {
  ok: true;
  token: string;
  uuid?: string;
  certSubject?: string;
  certThumbprint?: string;
  apiUrl?: string;
}

export interface CrptErrorResult {
  ok: false;
  error: string;
}

export type CrptScriptResult = CrptTokenResult | CrptErrorResult;

export interface CrptDiagnoseResult {
  ok: boolean;
  steps?: Array<{ step: string; ok: boolean; detail: string }>;
  certificates?: Array<{
    thumbprint: string;
    subject: string;
    issuer: string;
    hasPrivateKey: boolean;
  }>;
  error?: string;
}

function resolveCrptScriptPath(): string {
  const candidates = [
    path.join(process.cwd(), "scripts/crpt-get-token.py"),
    path.join(process.cwd(), "../scripts/crpt-get-token.py"),
    process.env.CRPT_SCRIPT_PATH?.trim(),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Не найден scripts/crpt-get-token.py. Проверь деплой и наличие файла в ~/otpravki/scripts/",
  );
}

function runCrptScript(args: string[]): Promise<CrptScriptResult | CrptDiagnoseResult> {
  return new Promise((resolve) => {
    const scriptPath = resolveCrptScriptPath();
    const child = spawn("python3", [scriptPath, ...args], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      const text = stdout.trim() || stderr.trim();
      try {
        const parsed = JSON.parse(text) as CrptScriptResult | CrptDiagnoseResult;
        if (code !== 0 && "error" in parsed && parsed.error) {
          resolve({ ok: false, error: parsed.error });
          return;
        }
        resolve(parsed);
      } catch {
        resolve({
          ok: false,
          error: text || `Скрипт ЧЗ завершился с кодом ${code ?? "?"}`,
        });
      }
    });

    child.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

export async function getCrptSessionToken(): Promise<CrptTokenResult> {
  const result = await runCrptScript([]);
  if (!result.ok) {
    throw new Error("error" in result ? result.error : "Не удалось получить токен ЧЗ");
  }
  if (!("token" in result) || !result.token) {
    throw new Error("Скрипт ЧЗ не вернул token");
  }
  return result;
}

export async function diagnoseCrpt(): Promise<CrptDiagnoseResult> {
  const result = await runCrptScript(["--diagnose"]);
  if ("steps" in result) return result;
  return { ok: false, error: "error" in result ? result.error : "Диагностика не удалась" };
}

export async function listCrptCertificates(): Promise<CrptDiagnoseResult["certificates"]> {
  const result = await runCrptScript(["--list-certs"]);
  if ("certificates" in result && Array.isArray(result.certificates)) {
    return result.certificates;
  }
  return [];
}
