import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const AUTH_DIR = path.join(DATA_DIR, "auth");
const BRANDS_FILE = path.join(AUTH_DIR, "brands.json");
const INVITES_FILE = path.join(AUTH_DIR, "brand-invites.json");

export interface StoredBrand {
  key: string;
  code: string;
  label: string;
  token: string;
  enabled: boolean;
  createdAt: number;
}

interface BrandsFile {
  version: 1;
  brands: StoredBrand[];
}

interface BrandInvite {
  id: string;
  expiresAt: number;
}

interface InvitesFile {
  version: 1;
  invites: BrandInvite[];
}

let brandsMemory: StoredBrand[] | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sanitizeToken(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

export function brandKeyFromCode(code: string): string {
  const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return cleaned || "BRAND";
}

export function brandIdsFromRaw(raw: string): Pick<StoredBrand, "key" | "code" | "label"> {
  const trimmed = raw.trim();
  const code =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 32) || brandKeyFromCode(trimmed).toLowerCase();
  const key = brandKeyFromCode(code);
  const label = trimmed.toUpperCase().slice(0, 40) || key;
  return { key, code, label };
}

function parseBrands(raw: string): StoredBrand[] {
  try {
    const parsed = JSON.parse(raw) as BrandsFile;
    if (!Array.isArray(parsed.brands)) return [];
    return parsed.brands.filter(
      (brand): brand is StoredBrand =>
        Boolean(brand?.key && brand.code && brand.label && brand.token),
    );
  } catch {
    return [];
  }
}

function readBrandsSync(): StoredBrand[] {
  if (brandsMemory) return brandsMemory;
  try {
    if (!existsSync(BRANDS_FILE)) {
      brandsMemory = [];
      return brandsMemory;
    }
    brandsMemory = parseBrands(readFileSync(BRANDS_FILE, "utf-8"));
    return brandsMemory;
  } catch {
    brandsMemory = [];
    return brandsMemory;
  }
}

async function writeBrands(brands: StoredBrand[]): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  const payload: BrandsFile = { version: 1, brands };
  const tmp = `${BRANDS_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(payload, null, 2), "utf-8");
  await rename(tmp, BRANDS_FILE);
  brandsMemory = brands;
}

export function listStoredBrands(): StoredBrand[] {
  return readBrandsSync();
}

export async function upsertStoredBrand(
  brand: Omit<StoredBrand, "createdAt"> & { createdAt?: number },
): Promise<StoredBrand> {
  return enqueueWrite(async () => {
    const brands = readBrandsSync().slice();
    const index = brands.findIndex(
      (entry) => entry.key === brand.key || entry.code === brand.code || entry.token === brand.token,
    );
    const next: StoredBrand = {
      key: brand.key,
      code: brand.code,
      label: brand.label,
      token: sanitizeToken(brand.token),
      enabled: brand.enabled,
      createdAt: brand.createdAt ?? brands[index]?.createdAt ?? Date.now(),
    };
    if (index >= 0) {
      brands[index] = { ...brands[index], ...next, createdAt: brands[index].createdAt };
    } else {
      brands.push(next);
    }
    await writeBrands(brands);
    return brands.find((entry) => entry.key === next.key) ?? next;
  });
}

export async function setStoredBrandEnabled(key: string, enabled: boolean): Promise<StoredBrand | null> {
  return enqueueWrite(async () => {
    const brands = readBrandsSync().slice();
    const index = brands.findIndex(
      (entry) => entry.key === key || entry.code === key.toLowerCase() || entry.label === key,
    );
    if (index < 0) return null;
    brands[index] = { ...brands[index], enabled };
    await writeBrands(brands);
    return brands[index];
  });
}

async function readInvites(): Promise<BrandInvite[]> {
  try {
    const raw = await readFile(INVITES_FILE, "utf-8");
    const parsed = JSON.parse(raw) as InvitesFile;
    const now = Date.now();
    return (parsed.invites ?? []).filter((invite) => invite.id && invite.expiresAt > now);
  } catch {
    return [];
  }
}

async function writeInvites(invites: BrandInvite[]): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  const payload: InvitesFile = { version: 1, invites };
  const tmp = `${INVITES_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(payload), "utf-8");
  await rename(tmp, INVITES_FILE);
}

export async function createBrandInvite(): Promise<BrandInvite> {
  const invites = await readInvites();
  const invite: BrandInvite = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
  invites.push(invite);
  await writeInvites(invites);
  return invite;
}

export async function consumeBrandInvite(id: string): Promise<boolean> {
  const token = id.trim();
  if (!token) return false;
  const invites = await readInvites();
  const index = invites.findIndex((invite) => invite.id === token);
  if (index < 0) return false;
  invites.splice(index, 1);
  await writeInvites(invites);
  return true;
}

export async function hasValidBrandInvite(id: string): Promise<boolean> {
  const token = id.trim();
  if (!token) return false;
  const invites = await readInvites();
  return invites.some((invite) => invite.id === token);
}

export function publicBrand(brand: StoredBrand) {
  return {
    key: brand.key,
    code: brand.code,
    label: brand.label,
    enabled: brand.enabled,
  };
}

export function maskedBrand(brand: StoredBrand) {
  const token = brand.token;
  return {
    ...publicBrand(brand),
    tokenHint: token.length <= 4 ? "••••" : `••••${token.slice(-4)}`,
  };
}
