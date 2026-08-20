import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { slugifyGuideTitle, type GuideBlock, type GuidePage } from "@/lib/guides";

const GUIDES_FILE = path.join(process.cwd(), "src/content/guides.json");

interface GuidesFile {
  version: 1;
  guides: GuidePage[];
}

function isBlock(raw: unknown): raw is GuideBlock {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as { type?: unknown; text?: unknown; items?: unknown };
  if (row.type === "heading" || row.type === "lead" || row.type === "paragraph" || row.type === "note") {
    return typeof row.text === "string";
  }
  if (row.type === "bullets" || row.type === "steps") {
    return Array.isArray(row.items) && row.items.every((item) => typeof item === "string");
  }
  return false;
}

function normalizeGuide(raw: unknown): GuidePage | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<GuidePage>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) return null;
  const slug =
    typeof row.slug === "string" && row.slug.trim()
      ? row.slug.trim()
      : slugifyGuideTitle(title);
  const blocks = Array.isArray(row.blocks) ? row.blocks.filter(isBlock) : [];
  return {
    slug,
    title,
    createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
    subtitle: typeof row.subtitle === "string" && row.subtitle.trim() ? row.subtitle.trim() : undefined,
    blocks,
    locked: row.locked === true,
  };
}

async function readGuidesFile(): Promise<GuidesFile> {
  try {
    const raw = await readFile(GUIDES_FILE, "utf-8");
    const parsed = JSON.parse(raw) as GuidesFile;
    const guides = Array.isArray(parsed.guides)
      ? parsed.guides.map(normalizeGuide).filter((row): row is GuidePage => row !== null)
      : [];
    return { version: 1, guides };
  } catch {
    return { version: 1, guides: [] };
  }
}

async function writeGuidesFile(file: GuidesFile): Promise<void> {
  await mkdir(path.dirname(GUIDES_FILE), { recursive: true });
  const tmp = `${GUIDES_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2) + "\n", "utf-8");
  await rename(tmp, GUIDES_FILE);
}

function uniqueSlug(title: string, existing: Set<string>): string {
  const base = slugifyGuideTitle(title);
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function listGuides(): Promise<GuidePage[]> {
  const file = await readGuidesFile();
  return [...file.guides].sort((a, b) => a.createdAt - b.createdAt);
}

export async function getGuide(slug: string): Promise<GuidePage | null> {
  const file = await readGuidesFile();
  return file.guides.find((guide) => guide.slug === slug) ?? null;
}

export async function createGuide(title: string): Promise<GuidePage> {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Нужно название темы");
  }

  const file = await readGuidesFile();
  const existing = new Set(file.guides.map((guide) => guide.slug));
  const guide: GuidePage = {
    slug: uniqueSlug(trimmed, existing),
    title: trimmed,
    createdAt: Date.now(),
    blocks: [],
  };
  file.guides.push(guide);
  await writeGuidesFile(file);
  return guide;
}

export async function setGuideLocked(slug: string, locked: boolean): Promise<GuidePage | null> {
  const file = await readGuidesFile();
  const guide = file.guides.find((row) => row.slug === slug);
  if (!guide) return null;
  if (locked) guide.locked = true;
  else delete guide.locked;
  await writeGuidesFile(file);
  return guide;
}
