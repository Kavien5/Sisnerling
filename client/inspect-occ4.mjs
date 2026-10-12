import { importSheetNative } from "./src/excelImportUtil.js";
import XLSXns from "xlsx-js-style";
import fs from "node:fs";
const XLSX = XLSXns.default ?? XLSXns;
const file = "C:/laragon/www/sisnerling/Sisnerling/server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx";
const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true, cellStyles: true });
const sh = importSheetNative("Penyusutan", wb.Sheets["Penyusutan"], wb.themes?.themeElements ? wb.themes : null);
const r = 7;
const row = sh.rows[r];
for (let ci=0; ci<5; ci++) {
  const key = sh.columns[ci].key;
  console.log(r+1, ci, key, 'v=', row[key], '__cv_=', row["__cv_"+key], '__=', row["__"+key], '__bd_=', row["__bd_"+key], '__fmt_=', row["__nf_"+key]);
}
