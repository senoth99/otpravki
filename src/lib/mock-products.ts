import type { ApiProduct } from "@/types/shipping";

/**
 * Локальный mock-каталог для dev/embedded режима.
 *
 * Внешний API поставок может иногда отдавать пустой список (или без данных),
 * из-за чего сборка/заказы в UI выглядят как “номер заказа без товаров”.
 */
export const MOCK_PRODUCTS: ApiProduct[] = [
  {
    id: "mock-tee-1",
    name: "Футболка базовая",
    slug: "basic-tee",
    images: [],
    brand: "CASHER",
    inStock: true,
    isDeleted: false,
    sizes: [
      { id: 101, size: "XS", quantity: 50, isVisible: true },
      { id: 102, size: "S", quantity: 50, isVisible: true },
      { id: 103, size: "M", quantity: 50, isVisible: true },
      { id: 104, size: "L", quantity: 50, isVisible: true },
      { id: 105, size: "XL", quantity: 50, isVisible: true },
    ],
  },
  {
    id: "mock-jeans-1",
    name: "Джинсы прямые",
    slug: "straight-jeans",
    images: [],
    brand: "CASHER",
    inStock: true,
    isDeleted: false,
    sizes: [
      { id: 201, size: "S", quantity: 40, isVisible: true },
      { id: 202, size: "M", quantity: 40, isVisible: true },
      { id: 203, size: "L", quantity: 40, isVisible: true },
      { id: 204, size: "XL", quantity: 40, isVisible: true },
      // чтобы сборка не падала на пустом видимом списке
      { id: 205, size: "XS", quantity: 40, isVisible: true },
    ],
  },
  {
    id: "mock-hoodie-1",
    name: "Худи комфорт",
    slug: "comfort-hoodie",
    images: [],
    brand: "SHECASH",
    inStock: true,
    isDeleted: false,
    sizes: [
      { id: 301, size: "XS", quantity: 25, isVisible: true },
      { id: 302, size: "S", quantity: 25, isVisible: true },
      { id: 303, size: "M", quantity: 25, isVisible: true },
      { id: 304, size: "L", quantity: 25, isVisible: true },
      { id: 305, size: "XL", quantity: 25, isVisible: true },
    ],
  },
  {
    id: "mock-ammo-1",
    name: "Куртка аммо-лайн",
    slug: "ammo-jacket",
    images: [],
    brand: "AMMO",
    inStock: true,
    isDeleted: false,
    sizes: [
      { id: 401, size: "S", quantity: 30, isVisible: true },
      { id: 402, size: "M", quantity: 30, isVisible: true },
      { id: 403, size: "L", quantity: 30, isVisible: true },
      { id: 404, size: "XL", quantity: 30, isVisible: true },
      { id: 405, size: "XS", quantity: 30, isVisible: true },
    ],
  },
  {
    id: "mock-kuraz-1",
    name: "Жилет курзаждивиз",
    slug: "kuraz-vest",
    images: [],
    brand: "KURAZHDVIZH",
    inStock: true,
    isDeleted: false,
    sizes: [
      { id: 501, size: "S", quantity: 20, isVisible: true },
      { id: 502, size: "M", quantity: 20, isVisible: true },
      { id: 503, size: "L", quantity: 20, isVisible: true },
      { id: 504, size: "XL", quantity: 20, isVisible: true },
      { id: 505, size: "XS", quantity: 20, isVisible: true },
    ],
  },
  {
    id: "mock-cap-1",
    name: "Кепка летняя",
    slug: "summer-cap",
    images: [],
    brand: "CASHER",
    inStock: true,
    isDeleted: false,
    sizes: [
      { id: 601, size: "XS", quantity: 10, isVisible: true },
      { id: 602, size: "S", quantity: 10, isVisible: true },
      { id: 603, size: "M", quantity: 10, isVisible: true },
      { id: 604, size: "L", quantity: 10, isVisible: true },
      { id: 605, size: "XL", quantity: 10, isVisible: true },
    ],
  },
];

export function getMockProducts(): ApiProduct[] {
  // На всякий случай возвращаем новую ссылку, чтобы случайные мутации не ломали исходники.
  return JSON.parse(JSON.stringify(MOCK_PRODUCTS)) as ApiProduct[];
}

