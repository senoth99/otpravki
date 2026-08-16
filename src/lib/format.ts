export const MOSCOW_TZ = "Europe/Moscow";

const MOSCOW_DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: MOSCOW_TZ,
  day: "numeric",
  month: "short",
};

const MOSCOW_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: MOSCOW_TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Календарная дата в Москве: YYYY-MM-DD */
export function moscowDateKey(value: Date | number | string = Date.now()): string {
  return toDate(value).toLocaleDateString("en-CA", { timeZone: MOSCOW_TZ });
}

export function isMoscowToday(value: Date | number | string): boolean {
  return moscowDateKey(value) === moscowDateKey();
}

/** +N календарных дней по московской дате */
export function addMoscowCalendarDays(value: Date | number | string, days: number): Date {
  const [year, month, day] = moscowDateKey(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
}

export function formatMoscowDate(value: Date | number | string): string {
  return toDate(value).toLocaleDateString("ru-RU", MOSCOW_DATE_OPTS);
}

export function formatMoscowDateTime(value: Date | number | string): string {
  return toDate(value).toLocaleString("ru-RU", MOSCOW_DATETIME_OPTS);
}

export function moscowDaysFromNow(days: number): string {
  return formatMoscowDate(addMoscowCalendarDays(Date.now(), days));
}

export function formatMoscowIso(value: Date | number | string = Date.now()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: MOSCOW_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(toDate(value))
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+03:00`;
}

export function formatSize(size: string): string {
  return size.trim().toUpperCase();
}

export function formatOrderNumberShort(orderNumber: string): string {
  const trimmed = orderNumber.trim();
  const digits = trimmed.replace(/\D/g, "");
  const last4 = (digits.slice(-4) || "0000").padStart(4, "0");
  const prefixMatch = trimmed.match(/^([A-Za-zА-Яа-яЁё]+)/);
  const prefix = prefixMatch?.[1] ?? "CSH";
  return `${prefix}-${last4}`;
}

/** Префикс + последние 4 цифры из полного номера (для UI). */
export function splitOrderNumberDisplay(orderNumber: string): {
  prefix: string;
  last4: string;
} {
  const trimmed = orderNumber.trim();
  if (!trimmed) return { prefix: "", last4: "" };

  let digitsFound = 0;
  let splitAt = trimmed.length;
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    if (/\d/.test(trimmed[i]!)) {
      digitsFound += 1;
      if (digitsFound === 4) {
        splitAt = i;
        break;
      }
    }
  }

  if (digitsFound < 4) {
    return { prefix: "", last4: trimmed };
  }

  return {
    prefix: trimmed.slice(0, splitAt),
    last4: trimmed.slice(splitAt),
  };
}
