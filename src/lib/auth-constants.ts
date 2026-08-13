/** Фиксированный пул аватаров — максимум 15 аккаунтов. */
export const AUTH_EMOJI_POOL = [
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐸",
  "🐙",
  "🦄",
  "🐝",
  "🦋",
  "🐬",
  "🦉",
  "🐧",
  "🐲",
] as const;

export type AuthEmoji = (typeof AUTH_EMOJI_POOL)[number];

export const AUTH_MAX_USERS = 15;
export const AUTH_IDLE_MS = 5 * 60 * 60 * 1000; // 5 часов
export const AUTH_SESSION_COOKIE = "otpravki_user";

export interface AuthUser {
  id: string;
  letter: string;
  emoji: string;
  pinHash: string;
  pinSalt: string;
  createdAt: number;
}

export interface AuthUserPublic {
  id: string;
  letter: string;
  emoji: string;
  createdAt: number;
}

export interface UserStatsRow {
  userId: string;
  letter: string;
  emoji: string;
  total: number;
  today: number;
  lastShift: number;
}

export interface AuthSession {
  token: string;
  userId: string;
  createdAt: number;
  lastActiveAt: number;
  shiftStartedAt: number;
}

export function toPublicUser(user: AuthUser): AuthUserPublic {
  return {
    id: user.id,
    letter: user.letter,
    emoji: user.emoji,
    createdAt: user.createdAt,
  };
}

export function normalizeLetter(raw: string): string | null {
  const letter = raw.trim().toUpperCase();
  if (!/^[A-ZА-ЯЁ]$/u.test(letter)) return null;
  return letter;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isAllowedEmoji(emoji: string): boolean {
  return (AUTH_EMOJI_POOL as readonly string[]).includes(emoji);
}
