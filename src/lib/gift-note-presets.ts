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
};

export const GIFT_NOTE_IMAGES: GiftNoteImage[] = [
  { id: "heart", label: "Сердце", src: "/gift-notes/heart.svg" },
  { id: "cake", label: "Торт", src: "/gift-notes/cake.svg" },
  { id: "star", label: "Звезда", src: "/gift-notes/star.svg" },
  { id: "gift", label: "Подарок", src: "/gift-notes/gift.svg" },
  { id: "balloon", label: "Шарик", src: "/gift-notes/balloon.svg" },
  { id: "snowflake", label: "Снежинка", src: "/gift-notes/snowflake.svg" },
  { id: "flower", label: "Цветок", src: "/gift-notes/flower.svg" },
  { id: "fire", label: "Огонь", src: "/gift-notes/fire.svg" },
  { id: "smile", label: "Смайл", src: "/gift-notes/smile.svg" },
  { id: "skull", label: "Череп", src: "/gift-notes/skull.svg" },
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
    imageId: "gift",
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
    imageId: "snowflake",
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
    imageId: "star",
  },
  {
    id: "fun-secret",
    category: "fun",
    label: "Секрет",
    text: "Секретная посылка.\nНе открывать при свидетелях.",
    imageId: "skull",
  },
  {
    id: "fun-magic",
    category: "fun",
    label: "Магия",
    text: "Ты заказал — мы доставили.\nМагия.",
    imageId: "star",
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
    imageId: "heart",
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
