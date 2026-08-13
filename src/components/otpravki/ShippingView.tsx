"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHardwareScanner } from "@/hooks/useHardwareScanner";
import { buildAssemblyAllocation } from "@/lib/assembly-status";
import { resolveScanFromBarcode } from "@/lib/barcode-product";
import { formatMoscowDate } from "@/lib/format";
import { getOrderDisplayStatus } from "@/lib/order-status";
import { findFirstAutoOrderIndex } from "@/lib/order-sort";
import { orderIsBlogger } from "@/lib/blogger-order";
import { printOrderBarcode } from "@/lib/print-barcode";
import { resolveOrderUrgency, URGENCY_LABELS } from "@/lib/urgency";
import { BloggerBadge } from "./BloggerBadge";
import type { AssemblyExtra } from "@/lib/assembly-extras";
import { toGtin14 } from "@/lib/chestny-znak-gtin";
import type { ApiProduct, AssemblyItem, ShippingOrder, ShippingOrderItem } from "@/types/shipping";
import { AutoModeButton } from "./AutoModeButton";
import { AutoModeCountdown } from "./AutoModeCountdown";
import { BarcodePrintModal } from "./BarcodePrintModal";
import { BarcodeScanner } from "./BarcodeScanner";
import { OrderComments } from "./OrderComments";
import { OrderExtrasHint } from "./OrderExtrasHint";
import { OrderItemRow } from "./OrderItemRow";
import { OrderNumberDisplay } from "./OrderNumberDisplay";
import { OrderPicker } from "./OrderPicker";
import { ScanErrorPopup } from "./ScanErrorPopup";
import { ShippedOrderCard } from "./ShippedOrderCard";

const PACK_UNIT_WAIT_MS = 2000;

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
  hasNext: boolean;
}

interface ShippingViewProps {
  orders: ShippingOrder[];
  assemblyItems: AssemblyItem[];
  selectedBrand: string;
  brandOptions: readonly string[];
  onBrandChange: (brand: string) => void;
  onOrdersChange: (next: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[])) => void;
}

function getOrderStoreBrand(order: ShippingOrder): string {
  return order.storeBrand?.trim() || "CASHER";
}

function findNextActiveOrderId(
  orders: ShippingOrder[],
  fromId: string | null,
  brand: string,
  readyOrderIds?: ReadonlySet<string>,
): string | null {
  const isEligible = (order: ShippingOrder) =>
    !order.barcodePrinted &&
    getOrderStoreBrand(order) === brand &&
    (!readyOrderIds || readyOrderIds.has(order.id));

  const from = fromId ? orders.findIndex((order) => order.id === fromId) : -1;
  for (let i = from + 1; i < orders.length; i++) {
    if (isEligible(orders[i])) {
      return orders[i].id;
    }
  }
  for (let i = 0; i < (from >= 0 ? from : orders.length); i++) {
    if (isEligible(orders[i])) {
      return orders[i].id;
    }
  }
  return null;
}

export function ShippingView({
  orders,
  assemblyItems,
  selectedBrand,
  brandOptions,
  onBrandChange,
  onOrdersChange,
}: ShippingViewProps) {
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(
    () => orders[0]?.id ?? null,
  );
  /** Снимок заказа после ручной печати — экран «трек напечатан» + перепечатка */
  const [manualConfirmOrder, setManualConfirmOrder] = useState<ShippingOrder | null>(null);
  const [reprinting, setReprinting] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
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
  const packingRef = useRef(false);

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
      `/api/assembly/extras?brand=${encodeURIComponent(selectedBrand)}`,
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
    () => buildAssemblyAllocation(orders, assemblyItems),
    [orders, assemblyItems],
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
          if (getOrderStoreBrand(order) !== selectedBrand) return false;
          // В workspace уже только заказы с наличием из API; «Собрано» не влияет
          return true;
        }),
    [orders, selectedBrand],
  );

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
    setScannerOpen(false);
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

      const gtin = czEnabled ? item.chestnyZnak?.trim() : "";
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
      setScannerOpen(false);
      void packOneUnit(order, currentItem);
    },
    [canScan, currentOrderId, orders, packOneUnit, products],
  );

  useHardwareScanner(validateScan, !manualMode && !scannerOpen && canScan);

  const updateItemCount = useCallback(
    (itemId: string, delta: number) => {
      if (!canScan || autoMode || packingRef.current) return;
      const order = orders.find((entry) => entry.id === currentOrderId);
      const item = order?.items.find((entry) => entry.id === itemId);
      if (!order || !item) return;

      if (delta < 0) {
        if (czEnabled && item.chestnyZnak?.trim()) return;
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

  const handlePrint = () => {
    if (!canScan || !allScanned || autoMode) return;
    setPrintModalOpen(true);
  };

  const goToNextOrder = useCallback(
    (updatedOrders: ShippingOrder[], fromOrderId?: string | null) => {
      const nextId = findNextActiveOrderId(
        updatedOrders,
        fromOrderId ?? currentOrderId,
        selectedBrand,
        readyOrderIds,
      );
      if (nextId) setCurrentOrderId(nextId);
    },
    [currentOrderId, readyOrderIds, selectedBrand],
  );

  const handlePrinted = () => {
    if (!currentOrder) return;
    setPrintModalOpen(false);
    const shippedAt = Date.now();
    const snapshot: ShippingOrder = {
      ...currentOrder,
      barcodePrinted: true,
      barcodePrintedAt: shippedAt,
    };
    const shippedId = currentOrder.id;
    onOrdersChange((prev) => {
      const updated = prev.map((order) =>
        order.id === shippedId
          ? { ...order, barcodePrinted: true, barcodePrintedAt: shippedAt }
          : order,
      );
      goToNextOrder(updated, shippedId);
      return updated;
    });
    // Ручной режим: оставляем экран «трек напечатан» с перепечаткой
    setManualConfirmOrder(snapshot);
  };

  const handleDismissManualConfirm = () => {
    setManualConfirmOrder(null);
  };

  const handleReprintConfirm = useCallback(async () => {
    if (!manualConfirmOrder || reprinting) return;
    setReprinting(true);
    setPrintError(null);
    const result = await printOrderBarcode(manualConfirmOrder.orderNumber, {
      orderId: manualConfirmOrder.id,
      barcodeUrl: manualConfirmOrder.barcodeUrl,
      order: manualConfirmOrder,
    });
    setReprinting(false);
    if (!result.ok) {
      setPrintError(result.message ?? "Не удалось перепечатать баркод");
    }
  }, [manualConfirmOrder, reprinting]);

  const handleNextOrder = () => {
    setManualConfirmOrder(null);
    goToNextOrder(orders);
  };

  useEffect(() => {
    if (!autoMode || countdown) return;

    const status = orderStatuses[currentIndex];
    if (!currentOrder?.barcodePrinted && status !== "awaiting-assembly" && status !== "shipped") {
      return;
    }

    const filteredOrders = activeIndices.map((index) => orders[index]);
    const filteredStatuses = activeIndices.map((index) => orderStatuses[index]);
    const next = findFirstAutoOrderIndex(filteredOrders, filteredStatuses);
    if (next !== null && filteredOrders[next].id !== currentOrderId) {
      setCurrentOrderId(filteredOrders[next].id);
    }
  }, [activeIndices, autoMode, countdown, currentOrder, currentIndex, currentOrderId, orderStatuses, orders]);

  useEffect(() => {
    if (!autoMode || !allScanned || !canScan || countdown || !currentOrder) return;
    if (autoHandledRef.current === currentOrder.id) return;

    autoHandledRef.current = currentOrder.id;
    const shippedNumber = currentOrder.orderNumber;
    const shippedId = currentOrder.id;

    void (async () => {
      const result = await printOrderBarcode(shippedNumber, {
        orderId: currentOrder.id,
        barcodeUrl: currentOrder.barcodeUrl,
        order: currentOrder,
      });
      if (!result.ok) {
        autoHandledRef.current = null;
        setPrintError(result.message ?? "Не удалось напечатать баркод");
        return;
      }

      const shippedAt = Date.now();
      const updatedOrders = orders.map((order) =>
        order.id === shippedId
          ? { ...order, barcodePrinted: true, barcodePrintedAt: shippedAt }
          : order,
      );
      const nextAllocation = buildAssemblyAllocation(updatedOrders, assemblyItems);
      const nextStatuses = updatedOrders.map((order) =>
        getOrderDisplayStatus(order, assemblyItems, nextAllocation),
      );
      const nextVisibleOrders = updatedOrders.filter(
        (order) => !order.barcodePrinted && getOrderStoreBrand(order) === selectedBrand,
      );
      const nextVisibleStatuses = nextVisibleOrders.map((order) => {
        const sourceIndex = updatedOrders.findIndex((entry) => entry.id === order.id);
        return nextStatuses[sourceIndex];
      });
      const hasNext = findFirstAutoOrderIndex(nextVisibleOrders, nextVisibleStatuses) !== null;

      onOrdersChange(updatedOrders);
      setManualConfirmOrder(null);
      setCountdown({ orderNumber: shippedNumber, secondsLeft: 5, hasNext });
    })();
  }, [
    allScanned,
    assemblyItems,
    autoMode,
    autoPrintRetry,
    canScan,
    countdown,
    currentOrder,
    currentOrderId,
    onOrdersChange,
    orders,
    selectedBrand,
  ]);

  const retryAutoPrint = useCallback(() => {
    setPrintError(null);
    autoHandledRef.current = null;
    setAutoPrintRetry((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!countdown) return;

    if (countdown.secondsLeft <= 0) {
      setCountdown(null);
      setManualConfirmOrder(null);
      autoHandledRef.current = null;
      const filteredOrders = activeIndices.map((index) => orders[index]);
      const filteredStatuses = activeIndices.map((index) => orderStatuses[index]);
      const next = findFirstAutoOrderIndex(filteredOrders, filteredStatuses);
      if (next !== null) setCurrentOrderId(filteredOrders[next].id);
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((prev) => (prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [activeIndices, countdown, orderStatuses, orders]);

  useEffect(() => {
    if (manualConfirmOrder) return;
    if (currentOrder?.barcodePrinted) {
      const nextId = findNextActiveOrderId(orders, currentOrderId, selectedBrand);
      if (nextId) setCurrentOrderId(nextId);
    }
  }, [orders, currentOrderId, currentOrder, manualConfirmOrder, selectedBrand]);

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
    if (activeIndices.length === 0) return;
    if (activeIndices.includes(currentIndex)) return;
    setCurrentOrderId(orders[activeIndices[0]].id);
  }, [currentIndex, orders, activeIndices, manualConfirmOrder]);

  const hasActiveOrders = activeIndices.length > 0;
  const hasShippableOrders = shippableIndices.length > 0;
  const hasShippedOrders = shippedOrders.length > 0 || isManualConfirm;

  if (!hasActiveOrders && !hasShippedOrders) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-1 py-1 sm:px-2">
          <AutoModeButton active={autoMode} onClick={handleAutoModeToggle} />
        </div>
        <div className="p-8 text-center">
          <p className="text-gray-500">Нет заказов на отправку</p>
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
    setCurrentOrderId(orders[index].id);
  };

  const pickerPosition = Math.max(1, activeIndices.indexOf(currentIndex) + 1);
  const pickerTotal = activeIndices.length || 1;

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
                      chestnyZnakActive={czEnabled}
                      remainingByGtin={remainingByGtin}
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <button
              type="button"
              aria-pressed={manualMode}
              onClick={() => {
                setManualMode((v) => {
                  const next = !v;
                  if (next) setScannerOpen(false);
                  return next;
                });
              }}
              className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors ${
                manualMode
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 active:bg-gray-50"
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 100 3m0-3h.01M17 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 100 3m0-3h.01" />
              </svg>
              <span className="truncate">Ручной</span>
            </button>

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={manualMode || packingOverlay}
              className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ${
                manualMode || packingOverlay
                  ? "cursor-not-allowed border border-transparent bg-gray-100 text-gray-300"
                  : "bg-gray-900 text-white active:bg-gray-800"
              }`}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">Сканер</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!allScanned}
              className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ${
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

      {scannerOpen && (
        <BarcodeScanner onScan={validateScan} onClose={() => setScannerOpen(false)} />
      )}

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

      {printModalOpen && currentOrder && (
        <BarcodePrintModal
          order={currentOrder}
          onClose={() => setPrintModalOpen(false)}
          onPrinted={handlePrinted}
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
          hasNext={countdown.hasNext}
          onExitAutoMode={exitAutoMode}
        />
      )}
    </div>
  );
}
