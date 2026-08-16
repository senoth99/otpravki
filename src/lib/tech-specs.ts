/** Нормализация имени товара / заголовка слайда для сопоставления */
export function normalizeProductLabel(value: string): string {
  let s = value.toLowerCase().replace(/ё/g, "е");
  s = s.normalize("NFKC");
  s = s.replace(/[«»“”„‟]/g, '"');
  s = s.replace(/[^a-z0-9а-я]+/gi, " ");
  return s.replace(/\s+/g, " ").trim();
}

export interface TechSpecRule {
  id: string;
  /** Все подстроки должны встретиться в нормализованном имени */
  must: string[];
  /** Хотя бы одна (тип изделия: футболка / шорты / …) */
  typeAny?: string[];
  /** Хотя бы одна доп. метка (csr / boss …) */
  requireAny?: string[];
  /** Если встречается — правило не подходит */
  exclude?: string[];
  files: string[];
}

/**
 * Правила из презентаций «ТЕХНИЧЕСКИЕ ХАРАКТЕРИСТИКИ» + «кураж».
 * files — JPEG-слайды в /public/tech-specs/
 */
export const TECH_SPEC_RULES: TechSpecRule[] = [
  { id: "aist", must: ["aist"], files: ["/tech-specs/ammo-casher-01.jpg"] },
  { id: "only-52", must: ["only 52"], files: ["/tech-specs/ammo-casher-02.jpg"] },
  {
    id: "wolf-tee",
    must: ["wolf"],
    typeAny: ["футболк"],
    files: ["/tech-specs/ammo-casher-03.jpg"],
  },
  {
    id: "mexico-tee",
    must: ["mexico"],
    typeAny: ["футболк"],
    files: ["/tech-specs/ammo-casher-04.jpg"],
  },
  {
    id: "cammo-tee",
    must: ["cammo"],
    typeAny: ["футболк"],
    files: ["/tech-specs/ammo-casher-05.jpg"],
  },
  { id: "liberty", must: ["liberty"], files: ["/tech-specs/ammo-casher-06.jpg"] },
  {
    id: "big-love",
    must: ["big love"],
    typeAny: ["джерси", "футболк"],
    exclude: ["браслет"],
    files: ["/tech-specs/ammo-casher-07.jpg"],
  },
  { id: "dollar-2", must: ["dollar"], files: ["/tech-specs/ammo-casher-08.jpg"] },
  {
    id: "fuck-broke-shorts",
    must: ["fuck broke"],
    typeAny: ["шорт"],
    files: ["/tech-specs/ammo-casher-09.jpg"],
  },
  {
    id: "omg-long",
    must: ["omg"],
    typeAny: ["лонгслив"],
    files: ["/tech-specs/ammo-casher-10.jpg"],
  },
  { id: "casual-omg", must: ["casual omg"], files: ["/tech-specs/ammo-casher-11.jpg"] },
  {
    id: "omg-tee",
    must: ["omg"],
    typeAny: ["футболк"],
    exclude: ["casual", "emerald"],
    files: ["/tech-specs/ammo-casher-12.jpg"],
  },
  { id: "moneymaker", must: ["moneymaker"], files: ["/tech-specs/ammo-casher-13.jpg"] },
  {
    id: "cash-boss-underwear",
    must: ["cash boss"],
    typeAny: ["трус"],
    files: ["/tech-specs/ammo-casher-14.jpg"],
  },
  {
    id: "omg-shorts",
    must: ["omg"],
    typeAny: ["шорт"],
    exclude: ["emerald", "casual"],
    files: ["/tech-specs/ammo-casher-15.jpg"],
  },
  {
    id: "omg-emerald",
    must: ["omg", "emerald"],
    typeAny: ["футболк"],
    files: ["/tech-specs/ammo-casher-16.jpg"],
  },
  {
    id: "light-classic-jersey-tee",
    must: ["light classic"],
    typeAny: ["джерси футболк"],
    files: ["/tech-specs/ammo-casher-17.jpg", "/tech-specs/ammo-casher-18.jpg"],
  },
  {
    id: "light-classic-pants",
    must: ["light classic"],
    typeAny: ["штан"],
    files: ["/tech-specs/ammo-casher-19.jpg"],
  },
  {
    id: "glitter-hoodie",
    must: ["glitter"],
    typeAny: ["худи"],
    files: ["/tech-specs/ammo-casher-20.jpg"],
  },
  {
    id: "glitter-pants",
    must: ["glitter"],
    typeAny: ["штан"],
    exclude: ["csr", "boss"],
    files: ["/tech-specs/ammo-casher-21.jpg"],
  },
  {
    id: "csr-boss-glitter-pants",
    must: ["glitter"],
    typeAny: ["штан"],
    requireAny: ["csr", "boss"],
    files: ["/tech-specs/ammo-casher-22.jpg"],
  },
  { id: "tai-lung", must: ["tai lung"], files: ["/tech-specs/ammo-casher-23.jpg"] },
  { id: "siemens", must: ["siemens"], files: ["/tech-specs/ammo-casher-24.jpg"] },
  { id: "pink-spark", must: ["pink spark"], files: ["/tech-specs/ammo-casher-25.jpg"] },
  {
    id: "cammo-shorts",
    must: ["cammo"],
    typeAny: ["шорт"],
    files: ["/tech-specs/ammo-casher-26.jpg"],
  },
  {
    id: "wolf-shorts",
    must: ["wolf"],
    typeAny: ["шорт"],
    files: ["/tech-specs/ammo-casher-27.jpg"],
  },
  {
    id: "classic-shorts",
    must: ["classic"],
    typeAny: ["шорт"],
    exclude: ["light classic", "cammo", "mexico", "wolf", "omg", "csr", "glitter"],
    files: ["/tech-specs/ammo-casher-28.jpg"],
  },
  {
    id: "mexico-shorts",
    must: ["mexico"],
    typeAny: ["шорт"],
    files: ["/tech-specs/ammo-casher-29.jpg"],
  },
  {
    id: "classic-pants",
    must: ["classic"],
    typeAny: ["штан"],
    exclude: ["light classic", "glitter", "wolf", "cash culture"],
    files: ["/tech-specs/ammo-casher-30.jpg"],
  },
  {
    id: "wolf-pants",
    must: ["wolf"],
    typeAny: ["штан"],
    files: ["/tech-specs/ammo-casher-31.jpg"],
  },
  { id: "maestro", must: ["maestro"], files: ["/tech-specs/ammo-casher-32.jpg"] },
  { id: "graf", must: ["graf"], files: ["/tech-specs/ammo-casher-33.jpg"] },

  // Кураж
  {
    id: "kurazh-gory-shorts",
    must: ["горы по колено"],
    typeAny: ["шорт"],
    files: ["/tech-specs/kurazh-01.jpg"],
  },
  {
    id: "kurazh-gory-tee",
    must: ["горы по колено"],
    typeAny: ["футболк"],
    files: ["/tech-specs/kurazh-02.jpg"],
  },
  {
    id: "kurazh-optimist",
    must: ["оптимист"],
    files: ["/tech-specs/kurazh-03.jpg"],
  },
  {
    id: "kurazh-svoih",
    must: ["своих не забывать"],
    typeAny: ["футболк"],
    files: ["/tech-specs/kurazh-04.jpg"],
  },
  {
    id: "kurazh-molodost",
    must: ["молодость"],
    files: ["/tech-specs/kurazh-05.jpg"],
  },
  {
    id: "kurazh-kayf-tee",
    must: ["жить в кайф"],
    typeAny: ["футболк"],
    files: ["/tech-specs/kurazh-06.jpg"],
  },
  {
    id: "kurazh-vremya",
    must: ["время без забот"],
    files: ["/tech-specs/kurazh-07.jpg"],
  },
];

function ruleMatches(rule: TechSpecRule, nameNorm: string): boolean {
  if ((rule.exclude ?? []).some((x) => nameNorm.includes(x))) return false;
  if (!rule.must.every((m) => nameNorm.includes(m))) return false;
  if (rule.requireAny && !rule.requireAny.some((r) => nameNorm.includes(r))) return false;
  if (rule.typeAny && !rule.typeAny.some((t) => nameNorm.includes(t))) return false;
  return true;
}

/** Картинки тех.характеристик для товара или null, если нет */
export function findTechSpecImages(productName: string | undefined | null): string[] | null {
  const nameNorm = normalizeProductLabel(productName ?? "");
  if (!nameNorm) return null;

  const hits = TECH_SPEC_RULES.filter((rule) => ruleMatches(rule, nameNorm));
  if (hits.length === 0) return null;

  hits.sort((a, b) => {
    const score = (r: TechSpecRule) =>
      r.must.join(" ").length * 10 + (r.typeAny?.length ?? 0) * 3 + (r.requireAny?.length ?? 0) * 2;
    return score(b) - score(a);
  });

  return hits[0].files;
}

export function hasTechSpecs(productName: string | undefined | null): boolean {
  return Boolean(findTechSpecImages(productName)?.length);
}
