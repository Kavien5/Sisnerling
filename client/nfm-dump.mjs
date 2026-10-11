import XLSXns from "xlsx-js-style";
import fs from "node:fs";
import path from "node:path";
import { importSheetNative, cellNumFmt } from "./src/excelImportUtil.js";
import { formatCellValue } from "./src/spreadsheet.js";
const XLSX = XLSXns.default ?? XLSXns;

const file = path.join(__dirname, "../server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx");
const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true, cellStyles: true });
const name = "Penyusutan";
const ws = wb.Sheets[name];
const sh = importSheetNative(name, ws, wb.themes && wb.themes.themeElements ? wb.themes : null);
const themes = (wb.themes && wb.themes.themeElements) ? wb.themes : null;

const samples = [
  ["D6", 5, 3], ["E6", 5, 4], ["G6", 5, 6], ["N6", 5, 13], ["C10", 9, 2],
  ["U6", 5, 20], ["B8", 7, 1], ["B16", 15, 1], ["D3", 2, 3], ["C3", 2, 2],
];
console.log("=== cell: file cell (v/t/s->nf) vs grid row/col, typeof, __nf_, formatted ===");
for (const [addr, r, ci] of samples) {
  const fileCell = ws[addr];
  const row = sh.rows[r];
  const col = sh.columns[ci];
  if (!col) continue;
  const raw = row && row[col.key];
  const nf = row && row["__nf_" + col.key];
  const nfFromCode = col && col.numFmt;
  let formatted = "";
  try { formatted = formatCellValue(raw, { numFmt: nf && nf.code ? nf.code : nf, width: col.width }); } catch (e) { formatted = "ERR:" + e.message; }
  const fcode = cellNumFmt ? "" : "";
  console.log(
    `${addr}: file.v=${fileCell && fileCell.v !== undefined ? String(fileCell.v).slice(0, 24) : "(none)"} t=${fileCell && fileCell.t} s=${fileCell && fileCell.s} ` +
    `| grid=${col.key} typeof=${typeof raw} raw="${String(raw).slice(0, 26)}" ` +
    `__nf_=${nf ? (nf.code || JSON.stringify(Object.keys(nf))) : "MISSING"} nf${nfFromCode ? "/col.numFmt=" + nfFromCode : ""} ` +
    `formatted="${String(formatted).slice(0, 30)}"`
  );
}

console.log("\n=== file numFmt definitions used (cells with s!=0) ===");
const nfSet = new Map();
function walkCells() {
  for (const addr of Object.keys(ws)) {
    if (addr[0] === "!") continue;
    const c = ws[addr];
    if (c && c.s) {
      const nf = cellNumFmt(c.s, themes, wb.SSF);
      if (nf && nf.code && !nfSet.has(addr)) {
        const pre = Array.from(nfSet.values())[0];
        if (!pre || true) nfSet.set(addr, nf);
        if (nfSet.size > 25) return;
      }
    }
  }
}
walkCells();
Array.from(nfSet.entries()).forEach(([a, nf], i) => {
  if (i > 25) return;
  console.log(`  s=${ws[a].s} ${a} "'${nf.code}'" => sample "${String(ws[a].v).slice(0, 20)}"`);
});
console.log("distinct nf codes seen:", new Set(Array.from(nfSet.values()).map((n) => n.code)).size);