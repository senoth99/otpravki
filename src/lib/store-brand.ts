export const ALL_BRANDS = "ALL";

export function isAllBrands(brand: string | undefined | null): boolean {
  return brand === ALL_BRANDS;
}

export function formatBrandLabel(brand: string): string {
  return isAllBrands(brand) ? "Все бренды" : brand;
}

export function getStoreBrand(value?: string | null): string {
  return value?.trim() || "CASHER";
}

export function matchesStoreBrand(value: string | undefined | null, selected: string): boolean {
  if (isAllBrands(selected)) return true;
  return getStoreBrand(value) === selected;
}
