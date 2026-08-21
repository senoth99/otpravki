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
^PW799
^LL1199
^FO40,40^A0N,56,56^FD${orderNumber}^FS
^FO40,140^BY3,3,720^BCN,720,Y,N,N^FD${code}^FS
^FO40,920^A0N,32,32^FDCasher Collection^FS
^XZ
`;
}

/** TSPL — TSC, Xprinter и похожие. Этикетка 100×150 мм (150×100). */
export function buildLabelTspl(orderNumber: string, barcodeData: string): string {
  const code = sanitizeBarcodeData(barcodeData);
  return `SIZE 100 mm,150 mm
GAP 2 mm,0 mm
DIRECTION 1
CLS
TEXT 40,40,"4",0,2,2,"${orderNumber}"
BARCODE 40,140,"128",720,1,0,3,6,"${code}"
TEXT 40,900,"3",0,1,1,"Casher Collection"
PRINT 1,1
`;
}
