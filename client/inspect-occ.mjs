import XLSXns from "xlsx-js-style";
import fs from "node:fs";
const XLSX = XLSXns.default ?? XLSXns;
import { importSheetNative } from "./src/excelImportUtil.js";

const file = "C:/laragon/www/sisnerling/Sisnerling/server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx";
const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true, cellStyles: true });
const sh = importSheetNative("Penyusutan", wb.Sheets["Penyusutan"], wb.themes?.themeElements ? wb.themes : null);

const r = 7; // Excel row 8, 0-based
const row = sh.rows[r];
console.log("row", r+1);
for (let ci = 0; ci < 5; ci++) {
  const key = sh.columns[ci].key;
  console.log(`  ci=${ci} key=${key}: v=${row?.[key]} __cv_=${row?.["__cv_"+key]} __bd_=${!!row?.["__bd_"+key]} __${key}=${row?.["__"+key]}`);
}
