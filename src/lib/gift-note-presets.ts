export type GiftNoteCategory = "birthday" | "holiday" | "fun" | "custom";

export type GiftNoteLayout = "text" | "image-left" | "image-top" | "image-only";

export type GiftNotePreset = {
  id: string;
  category: Exclude<GiftNoteCategory, "custom">;
  label: string;
  text: string;
  imageId?: string;
};

export type GiftNoteImage = {
  id: string;
  label: string;
  /** Путь относительно public/ */
  src: string;
  /** Для превью в UI */
  emoji: string;
};

/** Apple emoji (PNG) — угарные, хорошо читаются на термопринтере. */
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

export const GIFT_NOTE_PRESETS: GiftNotePreset[] = [
  {
    id: "bday-1",
    category: "birthday",
    label: "С ДР",
    text: "С днём рождения!\nПусть всё будет кайфово.",
    imageId: "cake",
  },
  {
    id: "bday-2",
    category: "birthday",
    label: "Тебе лично",
    text: "С ДР!\nЭтот заказ — тебе лично.",
    imageId: "party",
  },
  {
    id: "bday-3",
    category: "birthday",
    label: "Happy BD",
    text: "Happy Birthday!\nТы это заслужил(а).",
    imageId: "balloon",
  },
  {
    id: "hol-8m",
    category: "holiday",
    label: "8 Марта",
    text: "С 8 Марта!\nТы прекрасна — и точка.",
    imageId: "flower",
  },
  {
    id: "hol-ny",
    category: "holiday",
    label: "НГ",
    text: "С Новым годом!\nПусть следующий будет ещё жарче.",
    imageId: "snow",
  },
  {
    id: "hol-14",
    category: "holiday",
    label: "14 февраля",
    text: "С 14 февраля.\nТолько для тебя.",
    imageId: "heart",
  },
  {
    id: "hol-23",
    category: "holiday",
    label: "23 февраля",
    text: "С 23 февраля!\nКрепкого тебе вайба.",
    imageId: "fire",
  },
  {
    id: "fun-secret",
    category: "fun",
    label: "Секрет",
    text: "Секретная посылка.\nНе открывать при свидетелях.",
    imageId: "eyes",
  },
  {
    id: "fun-magic",
    category: "fun",
    label: "Магия",
    text: "Ты заказал — мы доставили.\nМагия.",
    imageId: "cool",
  },
  {
    id: "fun-vibe",
    category: "fun",
    label: "Вайб",
    text: "Внутри — вайб.\nОбращаться бережно.",
    imageId: "fire",
  },
  {
    id: "fun-tape",
    category: "fun",
    label: "Скотч",
    text: "Отправили с любовью\n(и скотчем).",
    imageId: "hearts",
  },
];

export const GIFT_NOTE_CATEGORIES: Array<{
  id: GiftNoteCategory;
  label: string;
}> = [
  { id: "birthday", label: "ДР" },
  { id: "holiday", label: "Праздники" },
  { id: "fun", label: "Приколы" },
  { id: "custom", label: "Своё" },
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
