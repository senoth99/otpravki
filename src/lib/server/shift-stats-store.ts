import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";
import type { AuthSession } from "@/lib/server/auth-session";
import { listAuthUsers, publicUser, type AuthUser } from "@/lib/server/auth-users-store";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const STATS_DIR = path.join(DATA_DIR, "stats");
const SHIPMENTS_FILE = path.join(STATS_DIR, "shipments.jsonl");
const SHIFT_SUMMARIES_FILE = path.join(STATS_DIR, "shift-summaries.jsonl");

export interface ShipmentEvent {
  ts: number;
  userId: string;
  orderId: string;
  orderNumber: string;
}

export interface ShiftSummary {
  userId: string;
  startedAt: number;
  endedAt: number;
  shipments: number;
}

function startOfLocalDay(ts = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function ensureStatsDir(): Promise<void> {
  await mkdir(STATS_DIR, { recursive: true });
}

export async function recordShipmentEvent(event: ShipmentEvent): Promise<void> {
  await ensureStatsDir();
  await appendFile(SHIPMENTS_FILE, `${JSON.stringify(event)}\n`, "utf-8");
}

export async function recordShiftSummary(summary: ShiftSummary): Promise<void> {
  await ensureStatsDir();
  await appendFile(SHIFT_SUMMARIES_FILE, `${JSON.stringify(summary)}\n`, "utf-8");
}

export async function loadShiftSummaries(): Promise<ShiftSummary[]> {
  try {
    const raw = await readFile(SHIFT_SUMMARIES_FILE, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as ShiftSummary;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ShiftSummary => Boolean(entry?.userId && entry.endedAt));
  } catch {
    return [];
  }
}

function lastClosedShiftCount(summaries: ShiftSummary[], userId: string): number {
  let latest: ShiftSummary | null = null;
  for (const summary of summaries) {
    if (summary.userId !== userId) continue;
    if (!latest || summary.endedAt > latest.endedAt) latest = summary;
  }
  return latest?.shipments ?? 0;
}

export async function loadShipmentEvents(): Promise<ShipmentEvent[]> {
  try {
    const raw = await readFile(SHIPMENTS_FILE, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as ShipmentEvent;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ShipmentEvent => Boolean(entry?.userId && entry.ts));
  } catch {
    return [];
  }
}

export function countShipmentsForShift(
  events: ShipmentEvent[],
  userId: string,
  shiftStartedAt: number,
): number {
  return events.filter(
    (event) => event.userId === userId && event.ts >= shiftStartedAt,
  ).length;
}

export function countShipmentsToday(events: ShipmentEvent[], userId: string): number {
  const from = startOfLocalDay();
  return events.filter((event) => event.userId === userId && event.ts >= from).length;
}

export function countShipmentsAllTime(events: ShipmentEvent[], userId: string): number {
  return events.filter((event) => event.userId === userId).length;
}

export function lastShiftShipments(
  events: ShipmentEvent[],
  userId: string,
  session: Pick<AuthSession, "shiftStartedAt" | "shiftShipments"> | null,
): number {
  if (!session) return 0;
  const fromEvents = countShipmentsForShift(events, userId, session.shiftStartedAt);
  if (typeof session.shiftShipments === "number") {
    return Math.max(session.shiftShipments, fromEvents);
  }
  return fromEvents;
}

export interface UserStatsRow {
  id: string;
  emoji: string;
  total: number;
  today: number;
}

export async function buildAllAccountsStats(): Promise<UserStatsRow[]> {
  const [users, events] = await Promise.all([listAuthUsers(), loadShipmentEvents()]);
  return users.map((user) => ({
    ...publicUser(user),
    total: countShipmentsAllTime(events, user.id),
    today: countShipmentsToday(events, user.id),
  }));
}

export async function buildUserLiveStats(
  user: AuthUser,
  session: AuthSession,
): Promise<{ today: number; shift: number; total: number }> {
  const events = await loadShipmentEvents();
  return {
    today: countShipmentsToday(events, user.id),
    shift: lastShiftShipments(events, user.id, session),
    total: countShipmentsAllTime(events, user.id),
  };
}
