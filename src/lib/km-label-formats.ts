/** Экранирование данных для ZPL ^FH\\ ^FD...^FS */
export function escapeZplHex(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126 || ch === "^" || ch === "~" || ch === "\\" || ch === "_") {
      out += `_${code.toString(16).padStart(2, "0").toUpperCase()}`;
    } else {
      out += ch;
    }
  }
  return out;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function buildKmLabelZpl(km: { cis: string; gtin?: string }): string {
  const gtin = km.gtin ?? km.cis.slice(2, 16);
  const matrix = escapeZplHex(km.cis);
  return `^XA
^CI28
^FO20,15^A0N,22,22^FD${truncate(gtin, 20)}^FS
^FO20,42^A0N,16,16^FDЧестный знак^FS
^FO20,65^BXN,4,200
^FH\\^FD${matrix}^FS
^XZ
`;
}

export function buildKmLabelTspl(km: { cis: string; gtin?: string }): string {
  const gtin = km.gtin ?? km.cis.slice(2, 16);
  const safe = km.cis.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `SIZE 58 mm, 40 mm
GAP 2 mm,0 mm
DIRECTION 1
CLS
TEXT 20,15,"3",0,1,1,"${truncate(gtin, 18)}"
TEXT 20,38,"2",0,1,1,"Chestny Znak"
QRCODE 20,58,L,4,A,0,M2,S7,"${safe}"
PRINT 1,1
`;
}

export function buildKmLabelText(km: { cis: string; gtin?: string }): string {
  const gtin = km.gtin ?? "";
  return ["CASHER · Честный знак", `GTIN: ${gtin}`, km.cis, ""].join("\n");
}
