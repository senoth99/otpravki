/** Бренды для надписей на коробки — логотип тянем с сайта. */

export const BOX_LABEL_BRANDS = [
  {
    id: "casher",
    label: "CASHER",
    site: "https://cashercollection.com",
  },
  {
    id: "ammo",
    label: "AMMO",
    site: "https://ammobrand.ru",
  },
  {
    id: "kurazh",
    label: "КУРАЖ",
    site: "https://kurazhdvizh.com",
  },
  {
    id: "shecash",
    label: "SHECASH",
    site: "https://shecashcollection.com",
  },
] as const;

export type BoxLabelBrandId = (typeof BOX_LABEL_BRANDS)[number]["id"];

export function getBoxLabelBrand(id: string) {
  return BOX_LABEL_BRANDS.find((b) => b.id === id) ?? null;
}

/** storeBrand из заказа → id для логотипа с сайта */
export function boxLabelBrandIdFromStoreBrand(brand?: string): BoxLabelBrandId | null {
  const lower = (brand ?? "").trim().toLowerCase();
  if (!lower) return null;
  if (lower === "ammo" || lower === "ammd" || lower.includes("ammo") || lower.includes("ammd")) {
    return "ammo";
  }
  if (lower.includes("кураж") || lower.includes("kurazh")) return "kurazh";
  if (lower.includes("shecash") || lower.includes("шекеш")) return "shecash";
  if (
    lower.includes("casher") ||
    lower.includes("кэшер") ||
    lower.includes("кешер") ||
    lower.includes("ca$her")
  ) {
    return "casher";
  }
  return null;
}
