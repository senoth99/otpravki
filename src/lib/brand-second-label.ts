/** Бренды, у которых перед треком печатается отдельный баркод-макет. */
export function brandNeedsSecondBarcode(brand?: string): boolean {
  const value = (brand ?? "").trim().toLowerCase();
  if (!value) return false;
  return (
    value === "ammo" ||
    value === "ammd" ||
    value === "kurazhdvizh" ||
    value === "kurazh" ||
    value.includes("кураж") ||
    value.includes("ammo")
  );
}

export type BrandBarcodeKind = "ammo" | "kurazh";

export function brandBarcodeKindFromStore(brand?: string): BrandBarcodeKind | null {
  if (!brandNeedsSecondBarcode(brand)) return null;
  const value = (brand ?? "").trim().toLowerCase();
  if (value === "ammo" || value === "ammd" || value.includes("ammo")) return "ammo";
  return "kurazh";
}
