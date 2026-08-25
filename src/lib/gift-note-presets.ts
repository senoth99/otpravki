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
  kind: "icon" | "sticker";
};

export const GIFT_NOTE_IMAGES: GiftNoteImage[] = [
  { id: "heart", label: "Сердце", src: "/gift-notes/heart.svg", kind: "icon" },
  { id: "cake", label: "Торт", src: "/gift-notes/cake.svg", kind: "icon" },
  { id: "star", label: "Звезда", src: "/gift-notes/star.svg", kind: "icon" },
  { id: "gift", label: "Подарок", src: "/gift-notes/gift.svg", kind: "icon" },
  { id: "balloon", label: "Шарик", src: "/gift-notes/balloon.svg", kind: "icon" },
  { id: "snowflake", label: "Снежинка", src: "/gift-notes/snowflake.svg", kind: "icon" },
  { id: "flower", label: "Цветок", src: "/gift-notes/flower.svg", kind: "icon" },
  { id: "fire", label: "Огонь", src: "/gift-notes/fire.svg", kind: "icon" },
  { id: "smile", label: "Смайл", src: "/gift-notes/smile.svg", kind: "icon" },
  { id: "skull", label: "Череп", src: "/gift-notes/skull.svg", kind: "icon" },
  {
    id: "casher-sticker",
    label: "Casher",
    src: "/extras/casher-sticker.png",
    kind: "sticker",
  },
  {
    id: "casher-logo",
    label: "Casher logo",
    src: "/extras/casher-sticker-logo.png",
    kind: "sticker",
  },
  {
    id: "kurazh-square",
    label: "Кураж",
    src: "/extras/kurazh-sticker-square.png",
    kind: "sticker",
  },
  {
    id: "kurazh-3d",
    label: "Кураж 3D",
    src: "/extras/kurazh-sticker-3d.png",
    kind: "sticker",
  },
  {
    id: "ammo-care",
    label: "Ammo care",
    src: "/extras/ammo-card-care.png",
    kind: "sticker",
  },
  {
    id: "ammo-discount",
    label: "Ammo %",
    src: "/extras/ammo-card-discount.png",
    kind: "sticker",
  },
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
    id: "fun-feature",
    category: "fun",
    label: "Фича",
    text: "Не баг, а фича\nв коробке.",
    imageId: "smile",
  },
  {
    id: "fun-tape",
    category: "fun",
    label: "Скотч",
    text: "Отправили с любовью\n(и скотчем).",
    imageId: "heart",
  },
  {
    id: "fun-plus",
    category: "fun",
    label: "В плюсе",
    text: "Если читаешь это —\nты уже в плюсе.",
    imageId: "smile",
  },
];

export const GIFT_NOTE_CATEGORIES: Array<{
  id: GiftNoteCategory;
  label: string;
}> = [
  { id: "birthday", label: "День рождения" },
  { id: "holiday", label: "Праздники" },
  { id: "fun", label: "Приколы" },
  { id: "custom", label: "Своё" },
];

export function getGiftNoteImage(id: string | null | undefined): GiftNoteImage | undefined {
  if (!id) return undefined;
  return GIFT_NOTE_IMAGES.find((img) => img.id === id);
}
