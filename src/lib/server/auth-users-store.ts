import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const AUTH_DIR = path.join(DATA_DIR, "auth");
const USERS_FILE = path.join(AUTH_DIR, "users.json");

export const MAX_AUTH_USERS = 15;

/** 15 популярных Apple-смайлов для аватаров. */
export const AUTH_EMOJI_POOL = [
  "😂",
  "😍",
  "😎",
  "🥺",
  "😭",
  "🤩",
  "😇",
  "🥳",
  "🤔",
  "😴",
  "😈",
  "🫠",
  "🫶",
  "🔥",
  "✨",
] as const;

export type AuthEmoji = (typeof AUTH_EMOJI_POOL)[number];

export interface AuthUser {
  id: string;
  emoji: string;
  pinHash: string;
  pinSalt: string;
  createdAt: number;
}

interface UsersFile {
  version: 1;
  users: AuthUser[];
}

export function isAuthEmoji(value: string): value is AuthEmoji {
  return (AUTH_EMOJI_POOL as readonly string[]).includes(value);
}

export function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString("hex");
}

export function verifyPin(pin: string, user: AuthUser): boolean {
  try {
    const a = Buffer.from(hashPin(pin, user.pinSalt), "hex");
    const b = Buffer.from(user.pinHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function newUserId(): string {
  return createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 16);
}

async function readUsersFile(): Promise<UsersFile> {
  try {
    const raw = await readFile(USERS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as UsersFile;
    if (!Array.isArray(parsed.users)) return { version: 1, users: [] };
    return {
      version: 1,
      users: parsed.users.filter(
        (user): user is AuthUser =>
          Boolean(user) &&
          typeof user.id === "string" &&
          typeof user.emoji === "string" &&
          user.emoji.length > 0 &&
          typeof user.pinHash === "string" &&
          typeof user.pinSalt === "string",
      ),
    };
  } catch {
    return { version: 1, users: [] };
  }
}

async function writeUsersFile(file: UsersFile): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  const tmp = `${USERS_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), "utf-8");
  await rename(tmp, USERS_FILE);
}

export async function listAuthUsers(): Promise<AuthUser[]> {
  const file = await readUsersFile();
  return file.users;
}

export async function getAuthUserById(id: string): Promise<AuthUser | null> {
  const users = await listAuthUsers();
  return users.find((user) => user.id === id) ?? null;
}

export function publicUser(user: AuthUser): { id: string; emoji: string } {
  return { id: user.id, emoji: user.emoji };
}

export async function listFreeEmojis(): Promise<AuthEmoji[]> {
  const users = await listAuthUsers();
  const taken = new Set(users.map((user) => user.emoji));
  return AUTH_EMOJI_POOL.filter((emoji) => !taken.has(emoji));
}

export async function registerAuthUser(input: {
  emoji: string;
  pin: string;
}): Promise<AuthUser> {
  if (!/^\d{4}$/.test(input.pin)) {
    throw new Error("PIN должен быть из 4 цифр");
  }
  if (!isAuthEmoji(input.emoji)) {
    throw new Error("Недопустимый смайлик");
  }

  const file = await readUsersFile();
  if (file.users.length >= MAX_AUTH_USERS) {
    throw new Error(`Максимум ${MAX_AUTH_USERS} аккаунтов`);
  }
  if (file.users.some((user) => user.emoji === input.emoji)) {
    throw new Error("Этот смайлик уже занят");
  }

  const pinSalt = randomBytes(16).toString("hex");
  const user: AuthUser = {
    id: newUserId(),
    emoji: input.emoji,
    pinHash: hashPin(input.pin, pinSalt),
    pinSalt,
    createdAt: Date.now(),
  };

  file.users.push(user);
  await writeUsersFile(file);
  return user;
}
