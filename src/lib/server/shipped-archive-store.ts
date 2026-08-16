import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { mergeShippedArchives } from "@/lib/shipped-archive";
import type { ShippingOrder } from "@/types/shipping";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const ARCHIVE_DIR = path.join(DATA_DIR, "workspace");
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, "shipped-archive.json");
const LEGACY_STATE_FILE = path.join(ARCHIVE_DIR, "state.json");
const ARCHIVE_MAX = Number(process.env.SHIPPED_ARCHIVE_MAX ?? 200);

interface ArchiveFile {
  version: 1;
  updatedAt: number;
  orders: ShippingOrder[];
}

export function capShippedArchive(orders: ShippingOrder[]): ShippingOrder[] {
  return mergeShippedArchives(orders).slice(0, ARCHIVE_MAX);
}

async function migrateLegacyArchive(): Promise<ShippingOrder[]> {
  try {
    const raw = await readFile(LEGACY_STATE_FILE, "utf-8");
    const state = JSON.parse(raw) as {
      shippedArchive?: ShippingOrder[];
      orders?: ShippingOrder[];
    };
    const legacy = capShippedArchive(
      mergeShippedArchives(state.shippedArchive ?? [], state.orders ?? []),
    );
    if (legacy.length > 0) {
      await savePersistedArchive(legacy);
    }
    return legacy;
  } catch {
    return [];
  }
}

export async function loadPersistedArchive(): Promise<ShippingOrder[]> {
  let orders: ShippingOrder[] = [];
  try {
    const raw = await readFile(ARCHIVE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ArchiveFile;
    if (!Array.isArray(parsed.orders)) {
      orders = await migrateLegacyArchive();
    } else {
      orders = capShippedArchive(parsed.orders);
      if (orders.length === 0) orders = await migrateLegacyArchive();
    }
  } catch {
    orders = await migrateLegacyArchive();
  }
  return enrichArchiveShippers(orders);
}

/** Подставляет emoji отправителя из журнала отправок, если на заказе ещё нет метки */
export async function enrichArchiveShippers(
  orders: ShippingOrder[],
): Promise<ShippingOrder[]> {
  if (orders.length === 0) return orders;
  if (orders.every((order) => order.shippedByEmoji)) return orders;

  try {
    const { loadShipmentEvents } = await import("@/lib/server/shift-stats-store");
    const { listAuthUsers } = await import("@/lib/server/auth-users-store");
    const [events, users] = await Promise.all([loadShipmentEvents(), listAuthUsers()]);
    if (events.length === 0) return orders;

    const emojiByUserId = new Map(users.map((user) => [user.id, user.emoji]));
    const latestByOrder = new Map<string, { userId: string; ts: number }>();
    for (const event of events) {
      const prev = latestByOrder.get(event.orderId);
      if (!prev || event.ts >= prev.ts) {
        latestByOrder.set(event.orderId, { userId: event.userId, ts: event.ts });
      }
    }

    return orders.map((order) => {
      if (order.shippedByEmoji && order.shippedByUserId) return order;
      const hit = latestByOrder.get(order.id);
      if (!hit) return order;
      return {
        ...order,
        shippedByUserId: order.shippedByUserId ?? hit.userId,
        shippedByEmoji: order.shippedByEmoji ?? emojiByUserId.get(hit.userId),
      };
    });
  } catch {
    return orders;
  }
}

export async function savePersistedArchive(orders: ShippingOrder[]): Promise<ShippingOrder[]> {
  const capped = capShippedArchive(orders);
  const payload: ArchiveFile = {
    version: 1,
    updatedAt: Date.now(),
    orders: capped,
  };
  await mkdir(ARCHIVE_DIR, { recursive: true });
  const tmp = `${ARCHIVE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(payload), "utf-8");
  await rename(tmp, ARCHIVE_FILE);
  return capped;
}

/** Диск + новые записи — никогда не затираем старый архив пустым массивом */
export async function mergePersistedArchive(...sources: ShippingOrder[][]): Promise<ShippingOrder[]> {
  const persisted = await loadPersistedArchive();
  const merged = capShippedArchive(mergeShippedArchives(persisted, ...sources));
  if (merged.length === 0) return persisted;
  return savePersistedArchive(merged);
}
