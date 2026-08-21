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
