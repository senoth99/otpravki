"use client";

import { useEffect, useId, useRef, useState } from "react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

type ScannerInstance = {
  stop: () => Promise<void>;
  clear: () => void;
  getState: () => number;
};

const STATE_SCANNING = 2;
const STATE_PAUSED = 3;

async function safeStopScanner(scanner: ScannerInstance | null) {
  if (!scanner) return;
  try {
    const state = scanner.getState();
    if (state === STATE_SCANNING || state === STATE_PAUSED) {
      await scanner.stop();
    }
    scanner.clear();
  } catch {
    // scanner already stopped or never started
  }
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<ScannerInstance | null>(null);
  const onScanRef = useRef(onScan);
  const lastScanRef = useRef(0);
  const scannedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRegionId = useId().replace(/:/g, "");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let mounted = true;
    let startTask: Promise<unknown> | null = null;

    const init = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!mounted) return;

        const scanner = new Html5Qrcode(scannerRegionId);
        scannerRef.current = scanner;

        startTask = scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => ({
              width: Math.min(width * 0.85, 280),
              height: Math.min(height * 0.45, 160),
            }),
          },
          (decodedText) => {
            if (!mounted || scannedRef.current) return;
            const now = Date.now();
            if (now - lastScanRef.current < 300) return;
            lastScanRef.current = now;
            scannedRef.current = true;
            onScanRef.current(decodedText);
            void safeStopScanner(scannerRef.current);
          },
          () => {},
        );

        await startTask;
      } catch (err) {
        if (!mounted) return;
        console.error("Scanner init error:", err);
        setError("Камера недоступна. Используйте сканер штрихкодов.");
      }
    };

    const frame = requestAnimationFrame(() => {
      void init();
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(frame);

      const scanner = scannerRef.current;
      scannerRef.current = null;

      void (async () => {
        try {
          if (startTask) await startTask.catch(() => {});
        } catch {
          // ignore
        }
        await safeStopScanner(scanner);
      })();
    };
  }, [scannerRegionId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black sm:items-center sm:justify-center sm:bg-black/60 sm:p-4">
      <div className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-w-lg sm:rounded-2xl sm:p-6 sm:shadow-xl">
        <div className="safe-bottom flex flex-1 flex-col p-4 sm:p-0">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Сканер</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 active:bg-gray-100"
              aria-label="Закрыть сканер"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div
            id={scannerRegionId}
            className="min-h-[50vh] flex-1 overflow-hidden rounded-xl bg-black sm:min-h-[280px] sm:flex-none"
          />

          {error && <p className="mt-3 text-center text-sm text-amber-600">{error}</p>}

          <p className="mt-4 text-center text-xs text-gray-500">
            Наведите камеру на штрихкод. USB-сканер работает без открытия камеры — просто
            сканируйте на экране заказа.
          </p>
        </div>
      </div>
    </div>
  );
}
