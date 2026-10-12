import XLSXns from "xlsx-js-style";
import fs from "node:fs";
import path from "node:path";
import { importSheetNative } from "./src/excelImportUtil.js";
import { evaluateGrid } from "./src/spreadsheet.js";
const XLSX = XLSXns.default ?? XLSXns;

const file = path.join(__dirname, "../server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx");
const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true, cellStyles: true });
const allSheets = {};
for (const nm of wb.SheetNames) {
  const sh = importSheetNative(nm, wb.Sheets[nm], wb.themes && wb.themes.themeElements ? wb.themes : null);
  allSheets[nm.toUpperCase()] = { rows: sh.rows, columns: sh.columns, name: nm.toUpperCase() };
}
const sh = allSheets["PENYUSUTAN"];
const res = evaluateGrid(sh.rows, sh.columns, allSheets, "PENYUSUTAN", { fileSheets: [], external: ()=>({}) });
const keys = ["2:C", "2:U", "2:AA", "4:AW", "5:AW", "6:U"];
for (const k of keys) {
  const v = res.get(k);
  console.log(`${k} -> ${JSON.stringify(v)} (${typeof v}) raw=${JSON.stringify(sh.rows[parseInt(k)][k.split(":")[1]])}`);
}