import XLSXns from "xlsx-js-style";
import fs from "node:fs";
import path from "node:path";
import { importSheetNative, cellNumFmt } from "./src/excelImportUtil.js";
const XLSX = XLSXns.default ?? XLSXns;

const file = path.join(__dirname, "../server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx");
const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true, cellStyles: true });
const ws = wb.Sheets["Penyusutan"];
const sh = importSheetNative("Penyusutan", ws, wb.themes && wb.themes.themeElements ? wb.themes : null);

for (const addr of ["C3", "U3", "AA3", "D6", "U6", "C5", "B4", "A1"]) {
  const c = ws[addr];
  const nf = cellNumFmt(c);
  console.log(`${addr}: s=${c && c.s ? JSON.stringify({ numFmt: c.s.numFmt, xf: c.s.xf }) : "none"} numFmt=${JSON.stringify(nf)} v=${JSON.stringify(c && c.v)}`);
}

let miss = 0, withNf = 0, numVals = 0;
for (const row of sh.rows) {
  if (!row) continue;
  for (const c of sh.columns) {
    if (c.hidden) continue;
    const v = row[c.key];
    if (typeof v !== "number") continue;
    numVals++;
    if (row["__nf_" + c.key]) withNf++; else miss++;
  }
}
console.log(`numeric cells: ${numVals} | with per-cell __nf_: ${withNf} | WITHOUT: ${miss}`);