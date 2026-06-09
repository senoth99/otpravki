"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHardwareScanner } from "@/hooks/useHardwareScanner";
import { buildAssemblyAllocation, getOrderAssemblyStatus } from "@/lib/assembly-status";
import { formatOrderNumberShort } from "@/lib/format";
import { getOrderDisplayStatus } from "@/lib/order-status";
import { findFirstAutoOrderIndex } from "@/lib/order-sort";
import { printOrderBarcode } from "@/lib/print-barcode";
import type { AssemblyItem, ShippingOrder } from "@/types/shipping";
import { AssemblyLockedCard } from "./AssemblyLockedCard";
import { AutoModeButton } from "./AutoModeButton";
import { AutoModeCountdown } from "./AutoModeCountdown";
import { BarcodePrintModal } from "./BarcodePrintModal";
import { BarcodeScanner } from "./BarcodeScanner";
import { OrderItemRow } from "./OrderItemRow";
import { OrderPicker } from "./OrderPicker";
import { ScanErrorPopup } from "./ScanErrorPopup";
import { ShippedArchive } from "./ShippedArchive";
import { ShippedOrderCard } from "./ShippedOrderCard";

const URGENCY_LABELS: Record<string, { label: string; className: string }> = {
  critical: { label: "Срочно", className: "bg-red-100 text-red-700" },
  high: { label: "Высокий", className: "bg-orange-100 text-orange-700" },
  normal: { label: "Обычный", className: "bg-blue-100 text-blue-700" },
  low: { label: "Низкий", className: "bg-gray-100 text-gray-600" },
};

interface CountdownState {
  orderNumber: string;
  secondsLeft: number;
  hasNext: boolean;
}

interface ShippingViewProps {
  orders: ShippingOrder[];
  assemblyItems: AssemblyItem[];
  onOrdersChange: (next: ShippingOrder[] | ((prev: ShippingOrder[]) => ShippingOrder[])) => void;
}

function findNextActiveIndex(orders: ShippingOrder[], from: number): number | null {
  for (let i = from + 1; i < orders.length; i++) {
    if (!orders[i].barcodePrinted) return i;
  }
  for (let i = 0; i < from; i++) {
    if (!orders[i].barcodePrinted) return i;
  }
  return null;
}

export function ShippingView({ orders, assemblyItems, onOrdersChange }: ShippingViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewingShippedId, setViewingShippedId] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [autoPrintRetry, setAutoPrintRetry] = useState(0);
  const [countdown, setCountdown] = useState<CountdownState | null>(null);
  const autoHandledRef = useRef<string | null>(null);

  const assemblyAllocation = useMemo(
    () => buildAssemblyAllocation(orders, assemblyItems),
    [orders, assemblyItems],
  );

  const orderStatuses = useMemo(
    () => orders.map((order) => getOrderDisplayStatus(order, assemblyItems, assemblyAllocation)),
    [orders, assemblyItems, assemblyAllocation],
  );

  const assemblyStatuses = useMemo(
    () => orders.map((order) => getOrderAssemblyStatus(order, assemblyItems, assemblyAllocation)),
    [orders, assemblyItems, assemblyAllocation],
  );

  const activeIndices = useMemo(
    () => orders.map((_, index) => index).filter((index) => !orders[index].barcodePrinted),
    [orders],
  );

  const shippableIndices = useMemo(
    () =>
      activeIndices.filter(
        (index) => assemblyAllocation.readyByOrderId.get(orders[index].id) === true,
      ),
    [activeIndices, assemblyAllocation, orders],
  );

  const shippedOrders = useMemo(
    () =>
      orders
        .filter((order) => order.barcodePrinted)
        .sort((a, b) => (b.barcodePrintedAt ?? 0) - (a.barcodePrintedAt ?? 0)),
    [orders],
  );

  const currentOrder = orders[currentIndex];
  const viewingShippedOrder = viewingShippedId
    ? orders.find((order) => order.id === viewingShippedId) ?? null
    : null;
  const displayOrder = viewingShippedOrder ?? currentOrder;
  const assemblyStatus = assemblyStatuses[currentIndex];
  const isAssemblyReady = assemblyStatus?.ready ?? false;
  const isShipped = displayOrder?.barcodePrinted ?? false;
  const isViewingArchive = viewingShippedOrder !== null;

  const allScanned =
    displayOrder?.items.every((i) => i.scannedCount >= i.quantity) ?? false;
  const urgency = displayOrder ? URGENCY_LABELS[displayOrder.urgency] : null;
  const canScan = isAssemblyReady && !isShipped && !countdown && !isViewingArchive;

  const exitAutoMode = useCallback(() => {
    setAutoMode(false);
    setCountdown(null);
    autoHandledRef.current = null;
  }, []);

  const handleAutoModeToggle = useCallback(() => {
    if (autoMode) {
      exitAutoMode();
      return;
    }
    setManualMode(false);
    setScannerOpen(false);
    setAutoMode(true);
    const next = findFirstAutoOrderIndex(orders, orderStatuses);
    if (next !== null) setCurrentIndex(next);
  }, [autoMode, exitAutoMode, orders, orderStatuses]);

  const validateScan = useCallback(
    (_code: string) => {
      if (!currentOrder || !canScan) return;

      const nextItem = currentOrder.items.find((item) => item.scannedCount < item.quantity);

      if (!nextItem) {
        setScanError("Все позиции в заказе уже отсканированы");
        return;
      }

      onOrdersChange((prev) =>
        prev.map((order, idx) =>
          idx === currentIndex
            ? {
                ...order,
                items: order.items.map((item) =>
                  item.id === nextItem.id
                    ? { ...item, scannedCount: item.scannedCount + 1, scannedAt: Date.now() }
                    : item,
                ),
              }
            : order,
        ),
      );
      setScannerOpen(false);
    },
    [currentOrder, currentIndex, canScan, onOrdersChange],
  );

  useHardwareScanner(validateScan, !manualMode && !scannerOpen && canScan);

  const updateItemCount = useCallback(
    (itemId: string, delta: number) => {
      if (!canScan || autoMode) return;

      onOrdersChange((prev) =>
        prev.map((order, idx) =>
          idx === currentIndex
            ? {
                ...order,
                items: order.items.map((item) => {
                  if (item.id !== itemId) return item;
                  const next = item.scannedCount + delta;
                  if (next < 0 || next > item.quantity) return item;
                  return { ...item, scannedCount: next, scannedAt: Date.now() };
                }),
              }
            : order,
        ),
      );
    },
    [autoMode, canScan, currentIndex, onOrdersChange],
  );

  const handlePrint = () => {
    if (!canScan || !allScanned || autoMode) return;
    setPrintModalOpen(true);
  };

  const goToNextOrder = useCallback(
    (updatedOrders: ShippingOrder[]) => {
      const next = findNextActiveIndex(updatedOrders, currentIndex);
      if (next !== null) setCurrentIndex(next);
    },
    [currentIndex],
  );

  const handlePrinted = () => {
    setPrintModalOpen(false);
    const shippedId = currentOrder?.id;
    onOrdersChange((prev) => {
      const updated = prev.map((order, idx) =>
        idx === currentIndex
          ? { ...order, barcodePrinted: true, barcodePrintedAt: Date.now() }
          : order,
      );
      goToNextOrder(updated);
      if (shippedId) setViewingShippedId(shippedId);
      return updated;
    });
  };

  const handleNextOrder = () => {
    goToNextOrder(orders);
  };

  useEffect(() => {
    if (!autoMode || countdown) return;

    const status = orderStatuses[currentIndex];
    if (!currentOrder?.barcodePrinted && status !== "awaiting-assembly" && status !== "shipped") {
      return;
    }

    const next = findFirstAutoOrderIndex(orders, orderStatuses);
    if (next !== null && next !== currentIndex) {
      setCurrentIndex(next);
    }
  }, [autoMode, countdown, currentIndex, currentOrder, orderStatuses, orders]);

  useEffect(() => {
    if (!autoMode || !allScanned || !canScan || countdown || !currentOrder) return;
    if (autoHandledRef.current === currentOrder.id) return;

    autoHandledRef.current = currentOrder.id;
    const shippedNumber = currentOrder.orderNumber;
    const shippedIndex = currentIndex;
    const shippedAt = Date.now();

    const updatedOrders = orders.map((order, idx) =>
      idx === shippedIndex
        ? { ...order, barcodePrinted: true, barcodePrintedAt: shippedAt }
        : order,
    );
    const nextAllocation = buildAssemblyAllocation(updatedOrders, assemblyItems);
    const nextStatuses = updatedOrders.map((order) =>
      getOrderDisplayStatus(order, assemblyItems, nextAllocation),
    );
    const hasNext = findFirstAutoOrderIndex(updatedOrders, nextStatuses) !== null;

    onOrdersChange(updatedOrders);
    setViewingShippedId(currentOrder.id);
    setCountdown({ orderNumber: shippedNumber, secondsLeft: 5, hasNext });

    void (async () => {
      const result = await printOrderBarcode(shippedNumber, {
        orderId: currentOrder.id,
        barcodeUrl: currentOrder.barcodeUrl,
      });
      if (result.ok) return;

      autoHandledRef.current = null;
      setCountdown(null);
      setViewingShippedId(null);
      onOrdersChange((prev) =>
        prev.map((order, idx) =>
          idx === shippedIndex
            ? { ...order, barcodePrinted: false, barcodePrintedAt: undefined }
            : order,
        ),
      );
      setPrintError(result.message ?? "Не удалось напечатать баркод");
    })();
  }, [
    allScanned,
    assemblyItems,
    autoMode,
    autoPrintRetry,
    canScan,
    countdown,
    currentIndex,
    currentOrder,
    onOrdersChange,
    orders,
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
      setViewingShippedId(null);
      autoHandledRef.current = null;
      const next = findFirstAutoOrderIndex(orders, orderStatuses);
      if (next !== null) setCurrentIndex(next);
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((prev) => (prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown, orders, orderStatuses]);

  useEffect(() => {
    if (viewingShippedId) return;
    if (currentOrder?.barcodePrinted) {
      const next = findNextActiveIndex(orders, currentIndex);
      if (next !== null) setCurrentIndex(next);
    }
  }, [orders, currentIndex, currentOrder, viewingShippedId]);

  useEffect(() => {
    if (viewingShippedId || shippableIndices.length === 0) return;
    if (!shippableIndices.includes(currentIndex)) {
      setCurrentIndex(shippableIndices[0]);
    }
  }, [currentIndex, shippableIndices, viewingShippedId]);

  const hasActiveOrders = activeIndices.length > 0;
  const hasShippableOrders = shippableIndices.length > 0;
  const hasShippedOrders = shippedOrders.length > 0;
  const awaitingAssemblyCount = activeIndices.length - shippableIndices.length;

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
  const hasNextUnshipped = orders.some((o, i) => i !== currentIndex && !o.barcodePrinted);

  const showActions = hasShippableOrders && isAssemblyReady && !isShipped && !autoMode && !isViewingArchive;

  const handleSelectActive = (index: number) => {
    setViewingShippedId(null);
    setCurrentIndex(index);
  };

  const handleSelectArchive = (orderId: string) => {
    setViewingShippedId(orderId);
  };

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
          {hasShippableOrders && (
            <OrderPicker
              orders={orders}
              currentIndex={currentIndex}
              statuses={orderStatuses}
              visibleIndices={shippableIndices}
              onSelect={handleSelectActive}
              locked={autoMode}
            />
          )}

          {hasActiveOrders && !hasShippableOrders && !isViewingArchive ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-center sm:px-6">
              <p className="text-sm font-medium text-amber-900">Сначала соберите заказы</p>
              <p className="mt-1 text-xs text-amber-800">
                {awaitingAssemblyCount > 0
                  ? `${awaitingAssemblyCount} заказ(ов) ждут сборки на вкладке «Сборка»`
                  : "Отметьте все позиции на вкладке «Сборка»"}
              </p>
            </div>
          ) : !displayOrder ? (
            <div className="py-6 text-center text-sm text-gray-500">Нет заказов на отправку</div>
          ) : !isAssemblyReady && !isViewingArchive ? (
            <AssemblyLockedCard missing={assemblyStatus?.missing ?? []} />
          ) : isShipped && !autoMode ? (
            <ShippedOrderCard
              orderNumber={displayOrder.orderNumber}
              customerName={displayOrder.customerName}
              hasNext={hasNextUnshipped && !isViewingArchive}
              onNext={isViewingArchive ? undefined : handleNextOrder}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
                      {formatOrderNumberShort(displayOrder.orderNumber)}
                    </h2>
                    {urgency && (
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${urgency.className}`}>
                        {urgency.label}
                      </span>
                    )}
                    {allScanned && (
                      <span className="rounded-lg bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                        Собран
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{displayOrder.customerName}</p>
                  <p className="text-xs text-gray-500">Срок: {displayOrder.deadline}</p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 sm:block sm:bg-transparent sm:p-0 sm:text-right">
                  <p className="text-sm font-medium text-gray-700">
                    {shippableIndices.indexOf(currentIndex) + 1 || 1} / {shippableIndices.length || 1}
                  </p>
                  <p className="text-xs tabular-nums text-gray-500">
                    Сканировано: {scannedCount} / {totalUnits}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {displayOrder.items.map((item) => (
                  <OrderItemRow
                    key={item.id}
                    item={item}
                    manual={manualMode && !autoMode}
                    onIncrement={() => updateItemCount(item.id, 1)}
                    onDecrement={() => updateItemCount(item.id, -1)}
                  />
                ))}
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
              disabled={manualMode}
              className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors ${
                manualMode
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

          <ShippedArchive
            orders={shippedOrders}
            selectedId={viewingShippedId}
            onSelect={handleSelectArchive}
          />
      </div>

      {scannerOpen && (
        <BarcodeScanner onScan={validateScan} onClose={() => setScannerOpen(false)} />
      )}

      {scanError && <ScanErrorPopup message={scanError} onClose={() => setScanError(null)} />}

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
          orderNumber={currentOrder.orderNumber}
          orderId={currentOrder.id}
          barcodeUrl={currentOrder.barcodeUrl}
          onClose={() => setPrintModalOpen(false)}
          onPrinted={handlePrinted}
        />
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
