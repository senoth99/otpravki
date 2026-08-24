export type GuideVideoSource = {
  src: string;
  type?: string;
};

export type GuideBlock =
  | { type: "heading"; text: string }
  | { type: "lead"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "note"; text: string }
  | {
      type: "video";
      /** Основной src (обычно mp4) */
      src: string;
      caption?: string;
      /** Доп. источники (webm и т.п.) */
      sources?: GuideVideoSource[];
      /** Вертикальный рилс 9:16 */
      aspect?: "9:16" | "16:9" | "auto";
    };

export interface GuidePage {
  slug: string;
  title: string;
  createdAt: number;
  subtitle?: string;
  blocks: GuideBlock[];
  locked?: boolean;
}

const CYR_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function slugifyGuideTitle(title: string): string {
  const translit = title
    .trim()
    .toLowerCase()
    .split("")
    .map((ch) => CYR_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return translit || "tema";
}
