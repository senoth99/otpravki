import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { AssemblyExtra } from "@/lib/assembly-extras";

export type { AssemblyExtra } from "@/lib/assembly-extras";
export { EXTRA_BRANDS } from "@/lib/assembly-extras";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const EXTRAS_FILE = path.join(DATA_DIR, "assembly", "extras.json");

interface ExtrasFile {
  version: 1;
  extras: AssemblyExtra[];
}

function newExtraId(): string {
  return randomBytes(8).toString("hex");
}

function normalizeExtra(raw: unknown): AssemblyExtra | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<AssemblyExtra>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const brand = typeof row.brand === "string" ? row.brand.trim() : "";
  if (!name || !brand) return null;
  const applyTo = row.applyTo === "products" ? "products" : "all";
  const productIds = Array.isArray(row.productIds)
    ? row.productIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  return {
    id: typeof row.id === "string" && row.id ? row.id : newExtraId(),
    brand,
    name,
    applyTo,
    productIds: applyTo === "products" ? productIds : [],
  };
}

async function readExtrasFile(): Promise<ExtrasFile> {
  try {
    const raw = await readFile(EXTRAS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ExtrasFile;
    const extras = Array.isArray(parsed.extras)
      ? parsed.extras.map(normalizeExtra).filter((row): row is AssemblyExtra => row !== null)
      : [];
    return { version: 1, extras };
  } catch {
    return { version: 1, extras: [] };
  }
}

async function writeExtrasFile(file: ExtrasFile): Promise<void> {
  await mkdir(path.dirname(EXTRAS_FILE), { recursive: true });
  const tmp = `${EXTRAS_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), "utf-8");
  await rename(tmp, EXTRAS_FILE);
}

export async function listAssemblyExtras(brand?: string): Promise<AssemblyExtra[]> {
  const file = await readExtrasFile();
  if (!brand) return file.extras;
  return file.extras.filter((extra) => extra.brand === brand);
}

export async function saveAssemblyExtras(extras: AssemblyExtra[]): Promise<AssemblyExtra[]> {
  const normalized = extras.map(normalizeExtra).filter((row): row is AssemblyExtra => row !== null);
  await writeExtrasFile({ version: 1, extras: normalized });
  return normalized;
}
