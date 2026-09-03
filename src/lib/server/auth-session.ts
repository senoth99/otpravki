import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthUser } from "@/lib/server/auth-users-store";
import { getAuthUserById, publicUser } from "@/lib/server/auth-users-store";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const AUTH_DIR = path.join(DATA_DIR, "auth");
const SESSIONS_FILE = path.join(AUTH_DIR, "sessions.json");

export const OTPRAVKI_USER_COOKIE = "otpravki_user";
export const IDLE_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 часов

export interface AuthSession {
  token: string;
  userId: string;
  createdAt: number;
  lastActiveAt: number;
  shiftStartedAt: number;
  /** Счётчик отправок в текущей смене (надёжнее, чем пересчёт по времени события) */
  shiftShipments?: number;
}

interface SessionsFile {
  version: 1;
  sessions: AuthSession[];
}

function sessionCookieOptions(maxAgeSec = Math.floor(IDLE_TIMEOUT_MS / 1000)) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.OTPRAVKI_COOKIE_SECURE === "true",
    path: "/",
    maxAge: maxAgeSec,
  };
}

async function readSessionsFile(): Promise<SessionsFile> {
  try {
    const raw = await readFile(SESSIONS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as SessionsFile;
    if (!Array.isArray(parsed.sessions)) return { version: 1, sessions: [] };
    return { version: 1, sessions: parsed.sessions };
  } catch {
    return { version: 1, sessions: [] };
  }
}

async function writeSessionsFile(file: SessionsFile): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  const tmp = `${SESSIONS_FILE}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), "utf-8");
  await rename(tmp, SESSIONS_FILE);
}

let sessionWriteChain: Promise<unknown> = Promise.resolve();

function enqueueSessionUpdate<T>(fn: () => Promise<T>): Promise<T> {
  const run = sessionWriteChain.then(fn, fn);
  sessionWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isSessionAlive(session: AuthSession, now = Date.now()): boolean {
  return now - session.lastActiveAt <= IDLE_TIMEOUT_MS;
}

export async function createAuthSession(userId: string): Promise<AuthSession> {
  const now = Date.now();
  const session: AuthSession = {
    token: randomBytes(24).toString("hex"),
    userId,
    createdAt: now,
    lastActiveAt: now,
    shiftStartedAt: now,
    shiftShipments: 0,
  };

  const file = await readSessionsFile();
  file.sessions = file.sessions.filter(
    (entry) => entry.userId !== userId && isSessionAlive(entry, now),
  );
  file.sessions.push(session);
  await writeSessionsFile(file);
  return session;
}

export async function getSessionByToken(token: string): Promise<AuthSession | null> {
  if (!token) return null;
  const now = Date.now();
  const file = await readSessionsFile();
  const session = file.sessions.find((entry) => entry.token === token);
  if (!session) return null;
  if (!isSessionAlive(session, now)) {
    file.sessions = file.sessions.filter((entry) => entry.token !== token);
    await writeSessionsFile(file);
    return null;
  }
  return session;
}

export async function touchAuthSession(token: string): Promise<AuthSession | null> {
  return enqueueSessionUpdate(async () => {
    const now = Date.now();
    const file = await readSessionsFile();
    const index = file.sessions.findIndex((entry) => entry.token === token);
    if (index < 0) return null;
    if (!isSessionAlive(file.sessions[index], now)) {
      file.sessions.splice(index, 1);
      await writeSessionsFile(file);
      return null;
    }
    file.sessions[index] = { ...file.sessions[index], lastActiveAt: now };
    await writeSessionsFile(file);
    return file.sessions[index];
  });
}

export async function incrementSessionShipments(token: string): Promise<number | null> {
  return enqueueSessionUpdate(async () => {
    const file = await readSessionsFile();
    const index = file.sessions.findIndex((entry) => entry.token === token);
    if (index < 0) return null;
    const next = (file.sessions[index].shiftShipments ?? 0) + 1;
    file.sessions[index] = { ...file.sessions[index], shiftShipments: next };
    await writeSessionsFile(file);
    return next;
  });
}

export async function destroyAuthSession(token: string): Promise<AuthSession | null> {
  return enqueueSessionUpdate(async () => {
    const file = await readSessionsFile();
    const index = file.sessions.findIndex((entry) => entry.token === token);
    if (index < 0) return null;
    const [removed] = file.sessions.splice(index, 1);
    await writeSessionsFile(file);
    return removed;
  });
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(OTPRAVKI_USER_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(OTPRAVKI_USER_COOKIE, "", sessionCookieOptions(0));
}

export function expireSessionCookieOnResponse(response: NextResponse): NextResponse {
  response.cookies.set(OTPRAVKI_USER_COOKIE, "", sessionCookieOptions(0));
  return response;
}

export async function readSessionTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(OTPRAVKI_USER_COOKIE)?.value ?? null;
}

export interface ActiveAuthContext {
  session: AuthSession;
  user: AuthUser;
  publicUser: ReturnType<typeof publicUser>;
}

export async function requireUserSession(options?: {
  touch?: boolean;
}): Promise<ActiveAuthContext | null> {
  const token = await readSessionTokenFromCookies();
  if (!token) return null;

  const session = options?.touch === false
    ? await getSessionByToken(token)
    : await touchAuthSession(token);
  if (!session) return null;

  const user = await getAuthUserById(session.userId);
  if (!user) {
    await destroyAuthSession(token);
    return null;
  }

  return {
    session,
    user,
    publicUser: publicUser(user),
  };
}
