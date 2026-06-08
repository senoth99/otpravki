/** HTML этикетки под типичный баркод-принтер ~58×40 мм */
export function buildLabelHtml(orderNumber: string, barcodeData: string) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${orderNumber}</title>
    <style>
      @page { size: 58mm 40mm; margin: 2mm; }
      html, body {
        width: 54mm;
        height: 36mm;
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        overflow: hidden;
      }
      .wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
      }
      .brand {
        font-size: 7pt;
        color: #666;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .order {
        font-size: 9pt;
        font-weight: 700;
        margin: 2mm 0 1mm;
      }
      .barcode {
        font-family: "Courier New", Courier, monospace;
        font-size: 11pt;
        font-weight: 700;
        letter-spacing: 1px;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="brand">Casher Collection</div>
      <div class="order">${orderNumber}</div>
      <div class="barcode">${barcodeData}</div>
    </div>
  </body>
</html>`;
}
