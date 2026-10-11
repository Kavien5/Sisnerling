import XLSXns from "xlsx-js-style";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import ExcelGrid from "./src/components/ExcelGrid.jsx";
import { importSheetNative } from "./src/excelImportUtil.js";
const XLSX = XLSXns.default ?? XLSXns;

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith("--file="));
const file = fileArg
  ? fileArg.slice(7)
  : path.join(__dirname, "../server/storage/workbooks/WB_001/original-7502adecb7ad.xlsx");
const sheetName = args.find((a) => !a.startsWith("--")) || "Penyusutan";

const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true, cellStyles: true });
const sh = importSheetNative(sheetName, wb.Sheets[sheetName], wb.themes && wb.themes.themeElements ? wb.themes : null);
console.log(`sheet=${sh.name || sheetName} rows=${sh.rows.length} cols=${sh.columns.length} native=${sh.native}`);

const hiddenRows = sh.rows.reduce((s, r, i) => { if (r && r.hidden) s.add(i); return s; }, new Set());

const html = renderToStaticMarkup(
  React.createElement(ExcelGrid, {
    rows: sh.rows,
    columns: sh.columns,
    merges: sh.merges || [],
    banner: sh.banner || null,
    hiddenRows,
  })
);
const outFile = path.join(__dirname, `render-${sheetName.replace(/\W+/g, "_")}.html`);
fs.writeFileSync(outFile, html, "utf8");
console.log("rendered bytes:", Buffer.byteLength(html));

const clipCount = (html.match(/cell-clip/g) || []).length;
console.log("cell-clip count:", clipCount);

function attr(s, name) {
  const m = s.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}
const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
const nCols = sh.columns.length;
let overlap = 0, gap = 0;
rows.forEach((rm, ri) => {
  const body = rm[1];
  const tds = [...body.matchAll(/<td\b[\s\S]*?(?:<\/td>|<td\b(?![\s\S]*?<\/td>))/g)];
  let slot = 0;
  for (const tm of tds) {
    const td = tm[0];
    const cs = parseInt(attr(td, "colspan") || "1", 10);
    const rs = parseInt(attr(td, "rowspan") || "1", 10);
    const disp = attr(td, "style") || "";
    const isNone = /display:\s*none/i.test(disp);
    if (isNone) continue;
    if (slot + cs > nCols) overlap++;
    if (slot !== 0 && false) gap++;
    slot += cs;
    void rs;
  }
  if (slot !== nCols && ri < 20) console.log(`row ${ri}: totalCols=${slot} col-span-cells=${tds.filter((t) => /colspan=/i.test(t[0])).length}`);
});
console.log("overlap(slot+cs>nCols):", overlap);

const samples = [];
for (const m of html.matchAll(/<td[^>]*>(<[^>]*>)*([^<]{4,60})<\/td>/g)) {
  const td = m[0];
  if (/cell-clip/.test(td)) samples.push("CLIP: " + (m[2] || "").trim().slice(0, 40));
}
console.log("clip samples:", samples.slice(0, 12).join(" | "));

const maset = (html.match(/3\.228\.172,20/g) || []).length;
const garbage = (html.match(/\* ?\d[\d.,]*_|_\(\)/g) || []).length;
console.log(`clean-number "3.228.172,20": ${maset} | accounting garbage tokens: ${garbage}`);
console.log("max-td-width check:", (html.match(/width:\s*(\d{4,})px/g) || []).slice(0, 5).join(","));
console.log("out:", outFile);