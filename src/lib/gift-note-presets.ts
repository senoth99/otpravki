export type GiftNoteLayout = "text" | "image-left" | "image-top" | "image-only";

export type GiftNoteImage = {
  id: string;
  label: string;
  /** Путь относительно public/ */
  src: string;
  /** Для превью в UI */
  emoji: string;
};

export type SavedGiftNoteText = {
  id: string;
  text: string;
  savedAt: number;
};

const SAVED_TEXTS_KEY = "otpravki.gift-note.saved-texts";

/** Apple emoji (PNG) — угарные + деньги, хорошо читаются на термопринтере. */
export const GIFT_NOTE_IMAGES: GiftNoteImage[] = [
  { id: "lol", label: "Лол", src: "/gift-notes/emoji-lol.png", emoji: "😂" },
  { id: "rofl", label: "Угар", src: "/gift-notes/emoji-rofl.png", emoji: "🤣" },
  { id: "zany", label: "Крейзи", src: "/gift-notes/emoji-zany.png", emoji: "🤪" },
  { id: "clown", label: "Клоун", src: "/gift-notes/emoji-clown.png", emoji: "🤡" },
  { id: "devil", label: "Чёрт", src: "/gift-notes/emoji-devil.png", emoji: "😈" },
  { id: "poop", label: "Какашка", src: "/gift-notes/emoji-poop.png", emoji: "💩" },
  { id: "fire", label: "Огонь", src: "/gift-notes/emoji-fire.png", emoji: "🔥" },
  { id: "cool", label: "Кул", src: "/gift-notes/emoji-cool.png", emoji: "😎" },
  { id: "party", label: "Тусовка", src: "/gift-notes/emoji-party.png", emoji: "🥳" },
  { id: "money", label: "Бабло", src: "/gift-notes/emoji-money.png", emoji: "🤑" },
  { id: "bag", label: "Мешок $", src: "/gift-notes/emoji-bag.png", emoji: "💰" },
  { id: "dollar", label: "Доллар", src: "/gift-notes/emoji-dollar.png", emoji: "💵" },
  { id: "wings", label: "Улетают", src: "/gift-notes/emoji-wings.png", emoji: "💸" },
  { id: "yen", label: "Йена", src: "/gift-notes/emoji-yen.png", emoji: "💴" },
  { id: "euro", label: "Евро", src: "/gift-notes/emoji-euro.png", emoji: "💶" },
  { id: "pound", label: "Фунт", src: "/gift-notes/emoji-pound.png", emoji: "💷" },
  { id: "gem", label: "Алмаз", src: "/gift-notes/emoji-gem.png", emoji: "💎" },
  { id: "coin", label: "Монета", src: "/gift-notes/emoji-coin.png", emoji: "🪙" },
  { id: "heavy-dollar", label: "$$$", src: "/gift-notes/emoji-heavy-dollar.png", emoji: "💲" },
  { id: "nails", label: "Ноготочки", src: "/gift-notes/emoji-nails.png", emoji: "💅" },
  { id: "eyes", label: "Глазки", src: "/gift-notes/emoji-eyes.png", emoji: "👀" },
  { id: "skull", label: "Череп", src: "/gift-notes/emoji-skull.png", emoji: "💀" },
  { id: "hot", label: "Жара", src: "/gift-notes/emoji-hot.png", emoji: "🥵" },
  { id: "cry", label: "Рёв", src: "/gift-notes/emoji-cry.png", emoji: "😭" },
  { id: "hearts", label: "Хартс", src: "/gift-notes/emoji-hearts.png", emoji: "🫶" },
  { id: "cake", label: "Торт", src: "/gift-notes/emoji-cake.png", emoji: "🎂" },
  { id: "gift", label: "Подарок", src: "/gift-notes/emoji-gift.png", emoji: "🎁" },
  { id: "heart", label: "Сердце", src: "/gift-notes/emoji-heart.png", emoji: "❤️" },
  { id: "rocket", label: "Ракета", src: "/gift-notes/emoji-rocket.png", emoji: "🚀" },
  { id: "star", label: "Звезда", src: "/gift-notes/emoji-star.png", emoji: "⭐" },
  { id: "balloon", label: "Шарик", src: "/gift-notes/emoji-balloon.png", emoji: "🎈" },
  { id: "flower", label: "Цветок", src: "/gift-notes/emoji-flower.png", emoji: "🌸" },
  { id: "snow", label: "Снег", src: "/gift-notes/emoji-snow.png", emoji: "❄️" },
];

export function getGiftNoteImage(id: string | null | undefined): GiftNoteImage | undefined {
  if (!id) return undefined;
  return GIFT_NOTE_IMAGES.find((img) => img.id === id);
}

/** Раскладка сама: картинка слева + текст, только текст или только картинка. */
export function resolveGiftNoteLayout(
  text: string,
  imageId: string | null | undefined,
): GiftNoteLayout {
  const hasText = Boolean(text.trim());
  const hasImage = Boolean(imageId);
  if (hasImage && hasText) return "image-left";
  if (hasImage) return "image-only";
  return "text";
}

export function loadSavedGiftNoteTexts(): SavedGiftNoteText[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_TEXTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedGiftNoteText =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as SavedGiftNoteText).id === "string" &&
          typeof (item as SavedGiftNoteText).text === "string",
      )
      .map((item) => ({
        id: item.id,
        text: item.text,
        savedAt: typeof item.savedAt === "number" ? item.savedAt : Date.now(),
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export function persistSavedGiftNoteTexts(items: SavedGiftNoteText[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVED_TEXTS_KEY, JSON.stringify(items.slice(0, 24)));
}

export function saveGiftNoteText(text: string, existing: SavedGiftNoteText[]): SavedGiftNoteText[] {
  const trimmed = text.trim();
  if (!trimmed) return existing;
  const withoutDup = existing.filter(
    (item) => item.text.trim().toLowerCase() !== trimmed.toLowerCase(),
  );
  const next: SavedGiftNoteText[] = [
    { id: `t-${Date.now()}`, text: trimmed, savedAt: Date.now() },
    ...withoutDup,
  ];
  persistSavedGiftNoteTexts(next);
  return next;
}

export function removeSavedGiftNoteText(
  id: string,
  existing: SavedGiftNoteText[],
): SavedGiftNoteText[] {
  const next = existing.filter((item) => item.id !== id);
  persistSavedGiftNoteTexts(next);
  return next;
}
