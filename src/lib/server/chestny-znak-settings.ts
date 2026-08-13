import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "chestny-znak", "settings.json");

export interface ChestnyZnakSettings {
  enabled: boolean;
}

const DEFAULT_SETTINGS: ChestnyZnakSettings = { enabled: true };

async function readSettingsFile(): Promise<ChestnyZnakSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ChestnyZnakSettings>;
    return { enabled: parsed.enabled !== false };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeSettingsFile(settings: ChestnyZnakSettings): Promise<void> {
  await mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  const tmp = `${SETTINGS_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(settings, null, 2), "utf-8");
  await rename(tmp, SETTINGS_FILE);
}

export async function getChestnyZnakSettings(): Promise<ChestnyZnakSettings> {
  return readSettingsFile();
}

export async function isChestnyZnakPackingEnabled(): Promise<boolean> {
  const settings = await readSettingsFile();
  return settings.enabled;
}

export async function setChestnyZnakPackingEnabled(
  enabled: boolean,
): Promise<ChestnyZnakSettings> {
  const settings = { enabled: Boolean(enabled) };
  await writeSettingsFile(settings);
  return settings;
}
