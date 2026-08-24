"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthGate";
import { useHardwareScanner } from "@/hooks/useHardwareScanner";
import { buildAssemblyAllocation, buildCollectedAssemblyAllocation } from "@/lib/assembly-status";
import { resolveScanFromBarcode } from "@/lib/barcode-product";
import { formatMoscowDate } from "@/lib/format";
import { getOrderDisplayStatus } from "@/lib/order-status";
import {
  findFirstAutoOrderIndex,
  findNextActiveOrderId,
  getSortedOrderIndices,
} from "@/lib/order-sort";
import { isBloggerOrder, orderIsBlogger } from "@/lib/blogger-order";
import { printOrderBarcode } from "@/lib/print-barcode";
import { brandNeedsSecondBarcode } from "@/lib/brand-second-label";
import { preloadProductImages } from "@/lib/image-url";
import { resolveOrderUrgency, URGENCY_LABELS } from "@/lib/urgency";
import { isAllBrands, matchesStoreBrand } from "@/lib/store-brand";
import type { AssemblyExtra } from "@/lib/assembly-extras";
import { toGtin14 } from "@/lib/chestny-znak-gtin";
import type { ApiProduct, AssemblyItem, ShippingOrder, ShippingOrderItem } from "@/types/shipping";
import { AutoModeButton } from "./AutoModeButton";
import { AutoModeCountdown } from "./AutoModeCountdown";
import { BloggerBadge } from "./BloggerBadge";
import { OrderComments } from "./OrderComments";
import { OrderExtrasHint } from "./OrderExtrasHint";
import { OrderItemRow } from "./OrderItemRow";
import { OrderNumberDisplay } from "./OrderNumberDisplay";
import { OrderPicker } from "./OrderPicker";
import { ScanErrorPopup } from "./ScanErrorPopup";
import { ShippedOrderCard } from "./ShippedOrderCard";

const PACK_UNIT_WAIT_MS = 2000;
const PRINT_COUNTDOWN_SEC = 10;
const NEXT_ORDER_COUNTDOWN_SEC = 3;

/** ЧЗ только для обычных заказов; блогерские (номер на «б») — без ЧЗ. */
function orderUsesChestnyZnak(order: { orderNumber: string }): boolean {
  return !isBloggerOrder(order.orderNumber);
}

async function waitMs(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function requestPackUnit(input: {
  gtin: string;
  orderId: string;
  itemId: string;
  productId: string;
  productName: string;
  size: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/chestnye-znaki/pack-unit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? "Не удалось списать честный знак" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Нет связи с сервером честного знака" };
  }
}

interface CountdownState {
  orderNumber: string;
  secondsLeft: number;
  totalSeconds: number;
  hasNext: boolean;
  /** between — пауза после баркода бренда перед треком; next — до следующего заказа */
  phase: "between" | "next";
  order: ShippingOrder;
  /** Перепечатка — не менять статус заказа */
  reprint?: boolean;
  auto?: boolean;
}

interface ShippingViewProps {
  orders: ShippingOrder[];
  assemblyItems: AssemblyItem[];
  selectedBrand: string;
  brandOptions: readonly string[];
  onBrandChange: (brand: string) => void;
  onOrdersChange: (next: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[])) => void;
  onOrderShipped?: () => void;
  /** Смена фильтров/бренда — открыть первый заказ нового списка */
  selectionResetKey?: string;
  /** Поиск: прыжок к заказу, без пересборки списка orders */
  searchQuery?: string;
  /** Подсказка, если список пуст из‑за фильтра */
  emptyHint?: string | null;
  /** collected — готовность по кнопке «Собрано» в приложении сборки */
  assemblyReadyBy?: "stock" | "collected";
}

function buildShippingAllocation(
  orders: ShippingOrder[],
  assemblyItems: AssemblyItem[],
  readyBy: "stock" | "collected",
) {
  return readyBy === "collected"
    ? buildCollectedAssemblyAllocation(orders, assemblyItems)
    : buildAssemblyAllocation(orders, assemblyItems);
}

function orderMatchesSearch(order: ShippingOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    order.orderNumber,
    order.customerName,
    order.city,
    order.trackingNumber,
    order.shippedByEmoji,
    ...(order.tags?.map((tag) => tag.label) ?? []),
    ...order.items.map((item) => item.productName),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function ShippingView({
  orders,
  assemblyItems,
  selectedBrand,
  brandOptions,
  onBrandChange,
  onOrdersChange,
  onOrderShipped,
  selectionResetKey = "",
  searchQuery = "",
  emptyHint = null,
  assemblyReadyBy = "stock",
}: ShippingViewProps) {
  const { user } = useAuth();
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(
    () => orders[0]?.id ?? null,
  );
  /** Снимок заказа после ручной печати — экран «трек напечатан» + перепечатка */
  const [manualConfirmOrder, setManualConfirmOrder] = useState<ShippingOrder | null>(null);
  const [reprinting, setReprinting] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [autoPrintRetry, setAutoPrintRetry] = useState(0);
  const [countdown, setCountdown] = useState<CountdownState | null>(null);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [extras, setExtras] = useState<AssemblyExtra[]>([]);
  const [packingOverlay, setPackingOverlay] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const [czEnabled, setCzEnabled] = useState(true);
  const [remainingByGtin, setRemainingByGtin] = useState<Record<string, number> | null>(null);
  const autoHandledRef = useRef<string | null>(null);
  const printBusyRef = useRef(false);
  const packingRef = useRef(false);
  const lastSelectionResetKeyRef = useRef(selectionResetKey);
  /** Курсор очереди: после печати заказ пропадает из filteredOrders — ищем следующий по номеру */
  const queueCursorRef = useRef<{ id: string; orderNumber: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/chestnye-znaki/settings", { cache: "no-store", signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { enabled?: boolean } | null) => {
          if (typeof data?.enabled === "boolean") setCzEnabled(data.enabled);
        })
        .catch((err) => {
          if (err instanceof Error && err.name === "AbortError") return;
        });
    };
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/chestnye-znaki/remaining", { cache: "no-store", signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { remaining?: Record<string, number> } | null) => {
          if (data?.remaining && typeof data.remaining === "object") {
            setRemainingByGtin(data.remaining);
          }
        })
        .catch((err) => {
          if (err instanceof Error && err.name === "AbortError") return;
        });
    };
    load();
    const timer = window.setInterval(load, 20_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/products", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { products?: ApiProduct[] } | null) => {
        if (data?.products) setProducts(data.products);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      isAllBrands(selectedBrand)
        ? "/api/assembly/extras"
        : `/api/assembly/extras?brand=${encodeURIComponent(selectedBrand)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { extras?: AssemblyExtra[] } | null) => {
        setExtras(data?.extras ?? []);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setExtras([]);
      });
    return () => controller.abort();
  }, [selectedBrand]);

  const assemblyAllocation = useMemo(
    () => buildShippingAllocation(orders, assemblyItems, assemblyReadyBy),
    [orders, assemblyItems, assemblyReadyBy],
  );

  const readyOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, ready] of assemblyAllocation.readyByOrderId) {
      if (ready) ids.add(id);
    }
    return ids;
  }, [assemblyAllocation]);

  const orderStatuses = useMemo(
    () => orders.map((order) => getOrderDisplayStatus(order, assemblyItems, assemblyAllocation)),
    [orders, assemblyItems, assemblyAllocation],
  );

  const activeIndices = useMemo(
    () =>
      orders
        .map((_, index) => index)
        .filter((index) => {
          const order = orders[index];
          if (order.barcodePrinted) return false;
          if (!matchesStoreBrand(order.storeBrand, selectedBrand)) return false;
          return true;
        }),
    [orders, selectedBrand],
  );

  const searchMatchIndices = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return activeIndices;
    return activeIndices.filter((index) => orderMatchesSearch(orders[index], q));
  }, [activeIndices, orders, searchQuery]);

  const shippableIndices = activeIndices;

  const shippedOrders = useMemo(
    () =>
      orders
        .filter((order) => order.barcodePrinted)
        .sort((a, b) => (b.barcodePrintedAt ?? 0) - (a.barcodePrintedAt ?? 0)),
    [orders],
  );

  const currentIndex = currentOrderId
    ? orders.findIndex((order) => order.id === currentOrderId)
    : -1;
  const currentOrder = currentIndex >= 0 ? orders[currentIndex] : undefined;
  const isManualConfirm = manualConfirmOrder !== null && !autoMode;
  const displayOrder = isManualConfirm ? manualConfirmOrder : currentOrder;
  const isShipped = displayOrder?.barcodePrinted ?? false;

  // Поиск только прыгает к первому совпадению — список заказов не режем
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) return;
    if (manualConfirmOrder || countdown) return;
    if (searchMatchIndices.length === 0) return;
    if (currentIndex >= 0 && searchMatchIndices.includes(currentIndex)) return;
    const first = searchMatchIndices[0];
    const order = orders[first];
    if (!order) return;
    queueCursorRef.current = { id: order.id, orderNumber: order.orderNumber };
    setCurrentOrderId(order.id);
  }, [
    searchQuery,
    searchMatchIndices,
    currentIndex,
    orders,
    manualConfirmOrder,
    countdown,
  ]);

  const allScanned =
    displayOrder?.items.every((i) => i.scannedCount >= i.quantity) ?? false;
  const urgency = displayOrder ? URGENCY_LABELS[resolveOrderUrgency(displayOrder)] : null;
  const canScan = !isManualConfirm && !isShipped && !countdown && !packingOverlay;

  const exitAutoMode = useCallback(() => {
    setAutoMode(false);
    setCountdown(null);
    setManualConfirmOrder(null);
    autoHandledRef.current = null;
  }, []);

  const handleAutoModeToggle = useCallback(() => {
    if (autoMode) {
      exitAutoMode();
      return;
    }
    setManualMode(false);
    setManualConfirmOrder(null);
    setAutoMode(true);
    const filteredOrders = activeIndices.map((index) => orders[index]);
    const filteredStatuses = activeIndices.map((index) => orderStatuses[index]);
    const next = findFirstAutoOrderIndex(filteredOrders, filteredStatuses);
    if (next !== null) setCurrentOrderId(filteredOrders[next].id);
  }, [activeIndices, autoMode, exitAutoMode, orderStatuses, orders]);

  const incrementPackedItem = useCallback(
    (orderId: string, itemId: string) => {
      onOrdersChange((prev) =>
        prev.map((order) =>
          order.id !== orderId
            ? order
            : {
                ...order,
                items: order.items.map((item) =>
                  item.id === itemId && item.scannedCount < item.quantity
                    ? {
                        ...item,
                        scannedCount: item.scannedCount + 1,
                        scannedAt: Date.now(),
                      }
                    : item,
                ),
              },
        ),
      );
    },
    [onOrdersChange],
  );

  const packOneUnit = useCallback(
    async (order: ShippingOrder, item: ShippingOrderItem) => {
      if (packingRef.current) return;
      if (item.scannedCount >= item.quantity) return;

      const gtin =
        czEnabled && orderUsesChestnyZnak(order) ? item.chestnyZnak?.trim() : "";
      packingRef.current = true;
      if (gtin) setPackingOverlay(true);
      setPackError(null);
      setScanError(null);

      try {
        if (gtin) {
          const [packResult] = await Promise.all([
            requestPackUnit({
              gtin,
              orderId: order.id,
              itemId: item.id,
              productId: item.productId,
              productName: item.productName,
              size: item.size,
            }),
            waitMs(PACK_UNIT_WAIT_MS),
          ]);
          if (!packResult.ok) {
            setPackError(packResult.error);
            return;
          }
          const packedGtin = toGtin14(gtin);
          if (packedGtin) {
            setRemainingByGtin((prev) => {
              if (!prev) return prev;
              return { ...prev, [packedGtin]: Math.max(0, (prev[packedGtin] ?? 0) - 1) };
            });
          }
        }
        incrementPackedItem(order.id, item.id);
      } finally {
        packingRef.current = false;
        setPackingOverlay(false);
      }
    },
    [czEnabled, incrementPackedItem],
  );

  const validateScan = useCallback(
    (code: string) => {
      const orderId = currentOrderId;
      if (!orderId || !canScan || packingRef.current) return;

      if (!products.length) {
        setScanError("Каталог товаров не загружен. Обнови страницу.");
        return;
      }

      const order = orders.find((entry) => entry.id === orderId);
      if (!order) return;

      const result = resolveScanFromBarcode(products, order, code);
      if (!result.ok) {
        setScanError(result.message);
        return;
      }

      const currentItem = order.items.find((item) => item.id === result.item.id);
      if (!currentItem || currentItem.scannedCount >= currentItem.quantity) {
        setScanError("Все единицы этой позиции уже отсканированы");
        return;
      }

      setScanError(null);
      void packOneUnit(order, currentItem);
    },
    [canScan, currentOrderId, orders, packOneUnit, products],
  );

  useHardwareScanner(validateScan, !manualMode && canScan);

  const updateItemCount = useCallback(
    (itemId: string, delta: number) => {
      if (!canScan || autoMode || packingRef.current) return;
      const order = orders.find((entry) => entry.id === currentOrderId);
      const item = order?.items.find((entry) => entry.id === itemId);
      if (!order || !item) return;

      if (delta < 0) {
        if (czEnabled && orderUsesChestnyZnak(order) && item.chestnyZnak?.trim()) return;
        onOrdersChange((prev) =>
          prev.map((entry) =>
            entry.id === currentOrderId
              ? {
                  ...entry,
                  items: entry.items.map((line) => {
                    if (line.id !== itemId) return line;
                    const next = line.scannedCount + delta;
                    if (next < 0 || next > line.quantity) return line;
                    return { ...line, scannedCount: next, scannedAt: Date.now() };
                  }),
                }
              : entry,
          ),
        );
        return;
      }

      if (delta > 0) void packOneUnit(order, item);
    },
    [autoMode, canScan, currentOrderId, czEnabled, onOrdersChange, orders, packOneUnit],
  );

  const goToNextOrder = useCallback(
    (
      updatedOrders: ShippingOrder[],
      fromOrderId?: string | null,
      afterOrderNumber?: string | null,
    ) => {
      const allocation = buildShippingAllocation(updatedOrders, assemblyItems, assemblyReadyBy);
      const nextStatuses = updatedOrders.map((order) =>
        getOrderDisplayStatus(order, assemblyItems, allocation),
      );
      const fromId = fromOrderId ?? currentOrderId;
      const afterNumber =
        afterOrderNumber ??
        queueCursorRef.current?.orderNumber ??
        (fromId ? updatedOrders.find((order) => order.id === fromId)?.orderNumber : null) ??
        null;
      const nextId = findNextActiveOrderId(
        updatedOrders,
        nextStatuses,
        fromId,
        selectedBrand,
        { afterOrderNumber: afterNumber },
      );
      if (nextId) {
        const nextOrder = updatedOrders.find((order) => order.id === nextId);
        if (nextOrder) {
          queueCursorRef.current = { id: nextOrder.id, orderNumber: nextOrder.orderNumber };
        }
        setCurrentOrderId(nextId);
      }
    },
    [assemblyItems, assemblyReadyBy, currentOrderId, selectedBrand],
  );

  const startBetweenCountdown = useCallback(
    (
      order: ShippingOrder,
      options: { hasNext: boolean; auto?: boolean; reprint?: boolean },
    ) => {
      setPrintError(null);
      setCountdown({
        orderNumber: order.orderNumber,
        secondsLeft: PRINT_COUNTDOWN_SEC,
        totalSeconds: PRINT_COUNTDOWN_SEC,
        hasNext: options.hasNext,
        phase: "between",
        order: { ...order, items: order.items.map((item) => ({ ...item })) },
        reprint: options.reprint,
        auto: options.auto,
      });
    },
    [],
  );

  const applyShippedState = useCallback(
    (shippedOrder: ShippingOrder, options: { auto: boolean; hasNext: boolean }) => {
      const shippedAt = Date.now();
      const snapshot: ShippingOrder = {
        ...shippedOrder,
        barcodePrinted: true,
        barcodePrintedAt: shippedAt,
        shippedByUserId: user?.id,
        shippedByEmoji: user?.emoji,
      };
      const shippedId = shippedOrder.id;
      queueCursorRef.current = {
        id: shippedId,
        orderNumber: shippedOrder.orderNumber,
      };

      onOrdersChange((prev) => {
        const updated = prev.map((order) =>
          order.id === shippedId
            ? {
                ...order,
                barcodePrinted: true,
                barcodePrintedAt: shippedAt,
                shippedByUserId: user?.id,
                shippedByEmoji: user?.emoji,
              }
            : order,
        );
        // В ручном режиме не прыгаем сразу — «Следующий заказ» сдвинет очередь один раз
        if (options.auto) {
          // current остаётся на отправленном до таймера next; переход в эффекте countdown
        }
        return updated;
      });
      onOrderShipped?.();

      if (options.auto) {
        setManualConfirmOrder(null);
        setCountdown({
          orderNumber: snapshot.orderNumber,
          secondsLeft: NEXT_ORDER_COUNTDOWN_SEC,
          totalSeconds: NEXT_ORDER_COUNTDOWN_SEC,
          hasNext: options.hasNext,
          phase: "next",
          order: snapshot,
          auto: true,
        });
      } else {
        setCountdown(null);
        setManualConfirmOrder(snapshot);
      }
    },
    [onOrderShipped, onOrdersChange, user],
  );

  const printTrackAndFinish = useCallback(
    async (
      order: ShippingOrder,
      options: { auto: boolean; hasNext: boolean; reprint?: boolean },
    ) => {
      const result = await printOrderBarcode(order.orderNumber, {
        orderId: order.id,
        barcodeUrl: order.barcodeUrl,
        order,
        stage: "track",
        skipShip: Boolean(options.reprint),
      });
      if (!result.ok) {
        setCountdown(null);
        autoHandledRef.current = null;
        printBusyRef.current = false;
        setPrintError(result.message ?? "Не удалось напечатать трек");
        return;
      }
      printBusyRef.current = false;
      if (options.reprint) {
        setCountdown(null);
        return;
      }
      applyShippedState(order, options);
    },
    [applyShippedState],
  );

  /** Сразу печать: баркод бренда (если есть) → таймер → трек; иначе сразу трек */
  const runShipPrint = useCallback(
    async (order: ShippingOrder, options: { auto: boolean; hasNext: boolean }) => {
      if (printBusyRef.current) return;
      printBusyRef.current = true;
      setPrintError(null);

      const needsBrand = brandNeedsSecondBarcode(order.storeBrand);
      if (needsBrand) {
        const brandResult = await printOrderBarcode(order.orderNumber, {
          orderId: order.id,
          barcodeUrl: order.barcodeUrl,
          order,
          stage: "brand",
          skipShip: true,
        });
        if (!brandResult.ok) {
          printBusyRef.current = false;
          autoHandledRef.current = null;
          setPrintError(brandResult.message ?? "Не удалось напечатать баркод бренда");
          return;
        }
        printBusyRef.current = false;
        startBetweenCountdown(order, {
          hasNext: options.hasNext,
          auto: options.auto,
        });
        return;
      }

      await printTrackAndFinish(order, options);
    },
    [printTrackAndFinish, startBetweenCountdown],
  );

  const handlePrint = () => {
    if (!canScan || !allScanned || autoMode || !currentOrder || countdown) return;
    const hasNext = activeIndices.some((index) => {
      const order = orders[index];
      return order && order.id !== currentOrder.id && !order.barcodePrinted;
    });
    autoHandledRef.current = currentOrder.id;
    void runShipPrint(currentOrder, { auto: false, hasNext });
  };

  const handleDismissManualConfirm = () => {
    setManualConfirmOrder(null);
  };

  const handleReprintConfirm = useCallback(async () => {
    if (!manualConfirmOrder || reprinting || countdown) return;
    setReprinting(true);
    setPrintError(null);
    const needsBrand = brandNeedsSecondBarcode(manualConfirmOrder.storeBrand);
    if (needsBrand) {
      const brandResult = await printOrderBarcode(manualConfirmOrder.orderNumber, {
        orderId: manualConfirmOrder.id,
        barcodeUrl: manualConfirmOrder.barcodeUrl,
        order: manualConfirmOrder,
        stage: "brand",
        skipShip: true,
      });
      setReprinting(false);
      if (!brandResult.ok) {
        setPrintError(brandResult.message ?? "Не удалось перепечатать баркод");
        return;
      }
      startBetweenCountdown(manualConfirmOrder, { hasNext: false, reprint: true });
      return;
    }
    const result = await printOrderBarcode(manualConfirmOrder.orderNumber, {
      orderId: manualConfirmOrder.id,
      barcodeUrl: manualConfirmOrder.barcodeUrl,
      order: manualConfirmOrder,
      stage: "track",
      skipShip: true,
    });
    setReprinting(false);
    if (!result.ok) {
      setPrintError(result.message ?? "Не удалось перепечатать баркод");
    }
  }, [manualConfirmOrder, reprinting, countdown, startBetweenCountdown]);

  const handleNextOrder = () => {
    const fromId = manualConfirmOrder?.id ?? currentOrderId;
    const afterNumber =
      manualConfirmOrder?.orderNumber ??
      queueCursorRef.current?.orderNumber ??
      currentOrder?.orderNumber ??
      null;
    setManualConfirmOrder(null);
    goToNextOrder(orders, fromId, afterNumber);
  };

  useEffect(() => {
    if (!autoMode || countdown) return;

    const status = orderStatuses[currentIndex];
    if (!currentOrder?.barcodePrinted && status !== "awaiting-assembly" && status !== "shipped") {
      return;
    }

    const afterNumber =
      currentOrder?.orderNumber ?? queueCursorRef.current?.orderNumber ?? null;
    const nextId = findNextActiveOrderId(
      orders,
      orderStatuses,
      currentOrderId,
      selectedBrand,
      { afterOrderNumber: afterNumber },
    );
    if (nextId && nextId !== currentOrderId) {
      setCurrentOrderId(nextId);
    }
  }, [
    autoMode,
    countdown,
    currentOrder,
    currentIndex,
    currentOrderId,
    orderStatuses,
    orders,
    selectedBrand,
  ]);

  useEffect(() => {
    if (!autoMode || !allScanned || !canScan || countdown || !currentOrder) return;
    if (autoHandledRef.current === currentOrder.id) return;

    autoHandledRef.current = currentOrder.id;
    const shippedId = currentOrder.id;
    const updatedOrders = orders.map((order) =>
      order.id === shippedId ? { ...order, barcodePrinted: true } : order,
    );
    const nextAllocation = buildShippingAllocation(updatedOrders, assemblyItems, assemblyReadyBy);
    const nextStatuses = updatedOrders.map((order) =>
      getOrderDisplayStatus(order, assemblyItems, nextAllocation),
    );
    const nextVisibleOrders = updatedOrders.filter(
      (order) => !order.barcodePrinted && matchesStoreBrand(order.storeBrand, selectedBrand),
    );
    const nextVisibleStatuses = nextVisibleOrders.map((order) => {
      const sourceIndex = updatedOrders.findIndex((entry) => entry.id === order.id);
      return nextStatuses[sourceIndex];
    });
    const hasNext = findFirstAutoOrderIndex(nextVisibleOrders, nextVisibleStatuses) !== null;

    void runShipPrint(currentOrder, { auto: true, hasNext });
  }, [
    allScanned,
    assemblyItems,
    assemblyReadyBy,
    autoMode,
    autoPrintRetry,
    canScan,
    countdown,
    currentOrder,
    orders,
    selectedBrand,
    runShipPrint,
  ]);

  const retryAutoPrint = useCallback(() => {
    setPrintError(null);
    autoHandledRef.current = null;
    printBusyRef.current = false;
    setAutoPrintRetry((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!countdown) return;

    if (countdown.secondsLeft > 0) {
      const timer = window.setTimeout(() => {
        setCountdown((prev) => (prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null));
      }, 1000);
      return () => window.clearTimeout(timer);
    }

    if (countdown.phase === "between") {
      if (printBusyRef.current) return;
      printBusyRef.current = true;
      void printTrackAndFinish(countdown.order, {
        auto: Boolean(countdown.auto),
        hasNext: countdown.hasNext,
        reprint: countdown.reprint,
      });
      return;
    }

    // phase "next" — следующий после отправленного, не с начала очереди
    setCountdown(null);
    setManualConfirmOrder(null);
    autoHandledRef.current = null;
    goToNextOrder(orders, countdown.order.id, countdown.order.orderNumber);
  }, [countdown, goToNextOrder, orders, printTrackAndFinish]);

  useEffect(() => {
    if (manualConfirmOrder) return;
    if (countdown) return;
    if (!currentOrder?.barcodePrinted) return;
    const afterNumber =
      currentOrder.orderNumber ?? queueCursorRef.current?.orderNumber ?? null;
    const nextId = findNextActiveOrderId(
      orders,
      orderStatuses,
      currentOrderId,
      selectedBrand,
      { afterOrderNumber: afterNumber },
    );
    if (nextId) setCurrentOrderId(nextId);
  }, [
    orders,
    orderStatuses,
    currentOrderId,
    currentOrder,
    manualConfirmOrder,
    selectedBrand,
    countdown,
  ]);

  useEffect(() => {
    if (brandOptions.length === 0) {
      return;
    }
    if (!brandOptions.includes(selectedBrand)) {
      onBrandChange(brandOptions[0]);
    }
  }, [brandOptions, onBrandChange, selectedBrand]);

  useEffect(() => {
    if (manualConfirmOrder) return;
    if (countdown) return;
    if (activeIndices.length === 0) return;
    if (activeIndices.includes(currentIndex)) return;
    // Заказ ушёл из списка (печать / фильтр) — продолжаем с курсора, не с первого
    const afterNumber =
      queueCursorRef.current?.orderNumber ??
      (currentOrderId
        ? orders.find((order) => order.id === currentOrderId)?.orderNumber
        : null) ??
      null;
    const nextId = findNextActiveOrderId(
      orders,
      orderStatuses,
      currentOrderId,
      selectedBrand,
      { afterOrderNumber: afterNumber },
    );
    if (nextId && nextId !== currentOrderId) setCurrentOrderId(nextId);
  }, [
    currentIndex,
    orders,
    orderStatuses,
    activeIndices,
    manualConfirmOrder,
    countdown,
    currentOrderId,
    selectedBrand,
  ]);

  useEffect(() => {
    if (selectionResetKey === lastSelectionResetKeyRef.current) return;
    lastSelectionResetKeyRef.current = selectionResetKey;
    if (manualConfirmOrder) return;
    if (activeIndices.length === 0) return;
    const sortedLocal = getSortedOrderIndices(
      activeIndices.map((index) => orders[index]),
      activeIndices.map((index) => orderStatuses[index]),
    );
    const firstIndex = activeIndices[sortedLocal[0] ?? 0];
    const firstId = orders[firstIndex]?.id;
    if (firstId) {
      queueCursorRef.current = {
        id: firstId,
        orderNumber: orders[firstIndex].orderNumber,
      };
      setCurrentOrderId(firstId);
    }
  }, [selectionResetKey, activeIndices, orders, orderStatuses, manualConfirmOrder]);

  const sortedActiveIndices = useMemo(
    () =>
      getSortedOrderIndices(
        activeIndices.map((index) => orders[index]),
        activeIndices.map((index) => orderStatuses[index]),
      ).map((localPos) => activeIndices[localPos]),
    [activeIndices, orders, orderStatuses],
  );

  // Прогрев фото текущего + соседних заказов — листание ← → без секундной паузы.
  useEffect(() => {
    if (sortedActiveIndices.length === 0) return;
    const pos = currentIndex >= 0 ? sortedActiveIndices.indexOf(currentIndex) : 0;
    const center = pos >= 0 ? pos : 0;
    const neighborIndices: number[] = [];
    for (let offset = -3; offset <= 5; offset++) {
      const at = center + offset;
      if (at < 0 || at >= sortedActiveIndices.length) continue;
      neighborIndices.push(sortedActiveIndices[at]);
    }
    // Первый заход в очередь — прогреть ещё ближние заказы вперёд.
    for (let i = 0; i < Math.min(12, sortedActiveIndices.length); i++) {
      neighborIndices.push(sortedActiveIndices[i]);
    }
    const urls: string[] = [];
    for (const index of neighborIndices) {
      const order = orders[index];
      if (!order) continue;
      for (const item of order.items) {
        if (item.imageUrl) urls.push(item.imageUrl);
      }
    }
    preloadProductImages(urls);
  }, [sortedActiveIndices, currentIndex, orders]);

  const hasActiveOrders = activeIndices.length > 0;
  const hasShippableOrders = shippableIndices.length > 0;
  const hasShippedOrders = shippedOrders.length > 0 || isManualConfirm;

  if (!hasActiveOrders && !hasShippedOrders) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-1 py-1 sm:px-2">
          <AutoModeButton active={autoMode} onClick={handleAutoModeToggle} />
        </div>
        <div className="space-y-2 p-8 text-center">
          <p className="font-medium text-gray-900">
            {emptyHint ? "Нет готовых к отправке" : "Нет заказов на отправку"}
          </p>
        </div>
      </div>
    );
  }

  const totalUnits = displayOrder?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  const scannedCount = displayOrder?.items.reduce((sum, i) => sum + i.scannedCount, 0) ?? 0;
  const hasNextUnshipped = activeIndices.length > 0;

  const showActions = hasShippableOrders && !isManualConfirm && !isShipped && !autoMode;

  const handleSelectActive = (index: number) => {
    setManualConfirmOrder(null);
    const order = orders[index];
    if (!order) return;
    queueCursorRef.current = { id: order.id, orderNumber: order.orderNumber };
    setCurrentOrderId(order.id);
  };

  const pickerPosition = Math.max(1, sortedActiveIndices.indexOf(currentIndex) + 1);
  const pickerTotal = sortedActiveIndices.length || 1;

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ${
        showActions ? "pb-28 sm:pb-0" : ""
      }`}
    >
      <div className="border-b border-gray-100 px-1 py-1 sm:px-2">
        <AutoModeButton active={autoMode} onClick={handleAutoModeToggle} />
      </div>

      <div className="space-y-4 p-3 sm:p-6">
          {hasActiveOrders && (
            <OrderPicker
              orders={orders}
              currentIndex={currentIndex}
              statuses={orderStatuses}
              visibleIndices={activeIndices}
              onSelect={handleSelectActive}
              locked={autoMode}
            />
          )}

          {!displayOrder ? (
            <div className="py-6 text-center text-sm text-gray-500">Нет заказов на отправку</div>
          ) : isManualConfirm ? (
            <div className="space-y-4">
              <ShippedOrderCard
                orderNumber={displayOrder.orderNumber}
                customerName={displayOrder.customerName}
                createdAt={displayOrder.createdAt}
                hasNext={hasNextUnshipped}
                onNext={hasNextUnshipped ? handleNextOrder : handleDismissManualConfirm}
                onReprint={handleReprintConfirm}
                reprinting={reprinting}
              />
              <OrderComments order={displayOrder} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-base font-semibold leading-none text-gray-900 sm:text-lg">
                      <OrderNumberDisplay orderNumber={displayOrder.orderNumber} />
                    </h2>
                    {orderIsBlogger(displayOrder) && <BloggerBadge />}
                    {urgency && (
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium leading-none ${urgency.className}`}
                      >
                        {urgency.label}
                      </span>
                    )}
                    {allScanned && (
                      <span className="inline-flex items-center rounded-lg bg-gray-900 px-2 py-0.5 text-xs font-medium leading-none text-white">
                        Собран
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{displayOrder.customerName}</p>
                  <p className="text-xs text-gray-500">
                    {displayOrder.createdAt
                      ? `Заказ от ${formatMoscowDate(displayOrder.createdAt)} · `
                      : ""}
                    Срок: {displayOrder.deadline}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 sm:block sm:bg-transparent sm:p-0 sm:text-right">
                  <p className="text-sm font-medium text-gray-700">
                    {pickerPosition} / {pickerTotal}
                  </p>
                  <p className="text-xs tabular-nums text-gray-500">
                    Сканировано: {scannedCount} / {totalUnits}
                  </p>
                </div>
              </div>

              <OrderComments order={displayOrder} />

              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <div className="min-w-0 flex-1 space-y-2">
                  {displayOrder.items.map((item) => (
                    <OrderItemRow
                      key={item.id}
                      item={item}
                      manual={manualMode && !autoMode}
                      busy={packingOverlay}
                      chestnyZnakActive={czEnabled && orderUsesChestnyZnak(displayOrder)}
                      hideChestnyZnak={!orderUsesChestnyZnak(displayOrder)}
                      remainingByGtin={remainingByGtin}
                      imagePriority
                      onIncrement={() => updateItemCount(item.id, 1)}
                      onDecrement={() => updateItemCount(item.id, -1)}
                    />
                  ))}
                </div>
                <OrderExtrasHint extras={extras} order={displayOrder} />
              </div>
            </div>
          )}

          {showActions && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-md safe-bottom sm:static sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <button
              type="button"
              aria-pressed={manualMode}
              onClick={() => setManualMode((v) => !v)}
              className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors active:scale-[0.98] ${
                manualMode
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 active:bg-gray-50"
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 1 .198-.471 1.575 1.575 0 1 0-2.228-2.228 3.818 3.818 0 0 0-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0 1 16.35 15m.002 0h-.002"
                />
              </svg>
              <span className="truncate">Ручной</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!allScanned}
              className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
                allScanned
                  ? "bg-blue-600 text-white active:bg-blue-700"
                  : "cursor-not-allowed bg-gray-100 text-gray-400"
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              <span className="truncate">Печать</span>
            </button>
              </div>
            </div>
          )}

      </div>

      {scanError && <ScanErrorPopup message={scanError} onClose={() => setScanError(null)} />}

      {packError && (
        <ScanErrorPopup
          title="Честный знак"
          message={packError}
          onClose={() => setPackError(null)}
        />
      )}

      {printError && (
        <ScanErrorPopup
          title="Ошибка печати"
          message={printError}
          onClose={() => {
            setPrintError(null);
            autoHandledRef.current = null;
          }}
          onRetry={autoMode ? retryAutoPrint : undefined}
          retryLabel="Печать снова"
        />
      )}

      {packingOverlay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white px-6 py-5 text-center shadow-xl">
            <p className="text-sm font-semibold text-gray-900">Печать и списание честного знака…</p>
            <p className="mt-1 text-xs text-gray-500">Подождите около 2 секунд</p>
          </div>
        </div>
      )}

      {countdown && (
        <AutoModeCountdown
          orderNumber={countdown.orderNumber}
          secondsLeft={countdown.secondsLeft}
          totalSeconds={countdown.totalSeconds}
          hasNext={countdown.hasNext}
          phase={countdown.phase}
          showExitAuto={autoMode}
          onExitAutoMode={exitAutoMode}
          onPrintNow={
            countdown.phase === "between"
              ? () => {
                  if (printBusyRef.current) return;
                  printBusyRef.current = true;
                  void printTrackAndFinish(countdown.order, {
                    auto: Boolean(countdown.auto),
                    hasNext: countdown.hasNext,
                    reprint: countdown.reprint,
                  });
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
