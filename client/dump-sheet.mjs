import XLSXns from "xlsx-js-style";
import fs from "node:fs";
import path from "node:path";
import { importSheetNative } from "./src/excelImportUtil.js";
import { colName, formatCellValue } from "./src/spreadsheet.js";
const XLSX = XLSXns.default ?? XLSXns;

const file = path.join(__dirname, "../server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx");
const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true, cellStyles: true });
const name = "Penyusutan";
const ws = wb.Sheets[name];
const sh = importSheetNative(name, ws, wb.themes && wb.themes.themeElements ? wb.themes : null);

console.log("ref:", ws["!ref"], "| merges(file):", (ws["!merges"]||[]).length);
console.log("grid rows:", sh.rows.length, "cols:", sh.columns.length, "native:", sh.native);
console.log("columns:", sh.columns.map((c,i)=>`${c.key}${c.hidden?"(H)":""}:${c.width}px`).join(" "));

const textW = (t) => (t ? String(t).length : 0);
let numBad = 0, numBadSamples = [];
let textBad = 0, textBadSamples = [];
const occupied = (row, ci) => {
  const col = sh.columns[ci];
  if (!col) return true;
  const v = row[col.key];
  const cv = row["__cv_" + col.key];
  if (v !== "" && v !== null && v !== undefined) return true;
  if (cv !== "" && cv !== undefined && cv !== null) return true;
  if (row["__" + col.key] || row["__bd_" + col.key]) return true;
  return false;
};
sh.rows.forEach((row, r) => {
  if (!row) return;
  for (let ci = 0; ci < sh.columns.length; ci++) {
    const col = sh.columns[ci];
    if (!col || col.hidden) continue;
    const v = row[col.key];
    if (v === null || v === undefined || v === "") continue;
    const nf = row["__nf_" + col.key] || col.numFmt;
    const disp = formatCellValue(v, { numFmt: nf, width: col.width });
    const need = Math.ceil(String(disp).length * 7.5);
    if (typeof v === "number" && need > col.width) {
      numBad++;
      if (numBadSamples.length < 25) numBadSamples.push({ r, ci, key: col.key, disp, colW: col.width, need });
    } else if (typeof v === "string" && need > col.width) {
      textBad++;
      const next = (() => { let nx = ci + 1; while (nx < sh.columns.length && sh.columns[nx] && sh.columns[nx].hidden) nx++; return nx; })();
      const nextOcc = next >= sh.columns.length ? true : occupied(row, next);
      if (textBadSamples.length < 25) textBadSamples.push({ r, ci, key: col.key, disp: String(disp).slice(0, 32), colW: col.width, need, nextOcc });
    }
  }
});
console.log("\npmbahan angka MELEBIHI kolom (formatted):", numBad);
numBadSamples.forEach((e) => console.log(`  r${e.r+1} ${e.key}: "${e.disp}" colW=${e.colW} needs~${e.need}`));
console.log("teks MELEBIHI kolom (next-visible occupied?):", textBad);
textBadSamples.forEach((e) => console.log(`  r${e.r+1} ${e.key}: "${e.disp}" colW=${e.colW} need~${e.need} nextOcc=${e.nextOcc}`));

console.log("\nmerges (grid):");
(sh.merges||[]).forEach((m) => {
  let visSpan = 0;
  for (let c = m.c1; c <= m.c2 && c < sh.columns.length; c++) if (!(sh.columns[c]&&sh.columns[c].hidden)) visSpan++;
  console.log(`  ${colName(m.c1)}${m.r1+1}:${colName(m.c2)}${m.r2+1} file(${m.c2-m.c1+1}w) vis(${visSpan}w)`);
});

console.log("\nteks panjang row 0..60 (nilai > 30 char):");
sh.rows.forEach((row, r) => {
  if (r > 60 || !row) return;
  sh.columns.forEach((c, ci) => {
    const v = row[c.key];
    if (v !== null && v !== undefined && String(v).length > 30) {
      console.log(`  r${r+1} ${c.key}(${c.width}px) [${String(v).length}ch]: "${String(v).slice(0, 60)}"`);
    }
  });
});