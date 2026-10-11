import XLSXns from "xlsx-js-style";
import fs from "node:fs";
const XLSX = XLSXns.default ?? XLSXns;

const file = process.argv[2] || "C:/laragon/www/sisnerling/Sisnerling/server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx";
const sheet = process.argv[3] || "Penyusutan";
const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true, cellStyles: true });
const ws = wb.Sheets[sheet];
console.log("ref:", ws["!ref"]);
console.log("!cols:", JSON.stringify((ws["!cols"] || []).slice(0, 8)));
console.log("!rows:", JSON.stringify((ws["!rows"] || []).slice(0, 12)));
console.log("merges:", (ws["!merges"] || []).map((m) => XLSX.utils.encode_range(m)).slice(0, 30));

const show = (r) => {
  for (const c of ["A", "B", "C", "D"]) {
    const addr = c + r;
    const cell = ws[addr];
    if (!cell) continue;
    const s = cell.s || {};
    const al = s.alignment || {};
    console.log(`  ${addr} val=${JSON.stringify(cell.v)} t=${cell.t} wrap=${al.wrapText} h=${al.horizontal} v=${al.vertical} border=${JSON.stringify(s.border || null)} fill=${JSON.stringify(s.fill || null)}`);
  }
};
[6, 7, 8, 9, 10, 11].forEach((r) => { console.log("row", r); show(r); });
