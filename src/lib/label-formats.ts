/** Убираем всё кроме символов, подходящих для Code 128 */
export function sanitizeBarcodeData(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "").trim();
}

export function buildLabelText(orderNumber: string, barcodeData: string): string {
  return [
    "CASHER COLLECTION",
    `Заказ: ${orderNumber}`,
    barcodeData,
    "",
  ].join("\n");
}

/** ZPL — Zebra и многие термопринтеры */
export function buildLabelZpl(orderNumber: string, barcodeData: string): string {
  const code = sanitizeBarcodeData(barcodeData);
  return `^XA
^CI28
^FO30,20^A0N,28,28^FD${orderNumber}^FS
^FO30,60^BY2,3,70^BCN,70,Y,N,N^FD${code}^FS
^FO30,150^A0N,18,18^FDCasher Collection^FS
^XZ
`;
}

/** TSPL — TSC, Xprinter и похожие */
export function buildLabelTspl(orderNumber: string, barcodeData: string): string {
  const code = sanitizeBarcodeData(barcodeData);
  return `SIZE 58 mm,40 mm
GAP 2 mm,0 mm
DIRECTION 1
CLS
TEXT 30,20,"3",0,1,1,"${orderNumber}"
BARCODE 30,55,"128",70,1,0,2,2,"${code}"
TEXT 30,140,"2",0,1,1,"Casher Collection"
PRINT 1,1
`;
}
