import * as XLSX from "xlsx-js-style";
import { colName } from "../src/spreadsheet.js";
import { importSheetNative } from "../src/excelImportUtil.js";
import { autoFitSheet } from "../src/excelImportUtil.js";
import { debugImportFidelity } from "../src/excelImportUtil.js";
import { importSheetFromXLSX } from "../src/excelImportUtil.js";
import { formatCellValue } from "../src/spreadsheet.js";
import fs from "node:fs";
import path from "node:path";

const ANALISIS = path.resolve(__dirname, "..", "..", "_analisis");

let failed = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  | " + extra : ""}`);
  if (!cond) failed++;
};

const widthPx = (fc) => {
  const px = fc.wpx || (fc.wch ? Math.round(fc.wch * 7 + 5) : 0);
  return px > 0 ? Math.max(6, Math.min(1200, Math.round(px))) : 64;
};

function buildBondWorkbook() {
  const aoa = [];
  aoa.push(["BOND OBLIGASI NEGARA - PORTOFOLIO"]);
  aoa.push([]);
  aoa.push(["Tahun", "Tanggal", "5Y", "FR", "FR %", "End Date", "Harga / Price", "Yield", "", "Spread", "Par Value", "Kupon", "", ...Array(10).fill(null)]);
  const years = [2008, 2009, 2010, 2008, 2012];
  for (let i = 0; i < 5; i++) {
    const base = ["", "", "", "", "", "", "", "", "", "", "", "", "", ...Array(10).fill(null)];
    aoa.push(base);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const vals = {
    3: { A: 2008, B: new Date(2008, 11, 31), C: 5, D: 0.0062, E: 0.09, F: new Date(2035, 2, 15), G: 99999.5, H: 0.0503, J: 0.012, K: 1000000, L: 0.0875, N: 2008, O: 1.5, S: 2008, V: 0.0422 },
    4: { A: 2009, B: new Date(2009, 11, 31), C: 5, D: 0.0058, E: 0.1203, F: new Date(2036, 2, 15), G: 98765.25, H: 0.0519, J: 0.013, K: 1000000, L: 0.0875, N: 2009, O: 1.6, S: 2009, V: 0.043 },
    5: { A: 2010, B: new Date(2010, 11, 31), C: 10, D: 0.0055, E: 0.126, F: new Date(2037, 5, 20), G: 97652, H: 0.0522, J: 0.014, K: 1000000, L: 0.0875, N: 2010, O: 1.7, S: 2010, V: 0.0441 },
    6: { A: 2008, B: new Date(2008, 5, 30), C: 10, D: 0.006, E: 0.095, F: new Date(2040, 2, 15), G: 98999, H: 0.0498, J: 0.011, K: 1000000, L: 0.0875, N: 2011, O: 1.8, S: 2011, V: 0.045 },
    7: { A: 2012, B: new Date(2012, 11, 3), C: 15, D: 0.0065, E: 0.114, F: new Date(2038, 2, 15), G: 94100, H: 0.0558, J: 0.015, K: 1000000, L: 0.0875, N: 2012, O: 1.9, S: 2012, V: 0.0462 },
  };
  for (const r in vals) {
    for (const c in vals[r]) {
      const ci = XLSX.utils.decode_cell(c + "1").c;
      const addr = XLSX.utils.encode_cell({ r: Number(r), c: ci });
      const isDate = c === "B" || c === "F";
      ws[addr] = { t: isDate ? "d" : "n", v: vals[r][c] };
    }
  }

  const fmt = {
    E: "0.00%", H: "0.00%", C: "0", D: "0.000%", G: "#,##0.00", J: "0.000%", K: "#,##0", L: "0.0000%",
    N: "0", O: "0.0", S: "0", V: "0.0000%",
  };
  for (const r in vals) {
    for (const c in vals[r]) {
      const ci = XLSX.utils.decode_cell(c + "1").c;
      const cell = ws[XLSX.utils.encode_cell({ r: Number(r), c: ci })];
      const isDate = c === "B" || c === "F";
      cell.z = isDate ? "dd-mmm-yyyy" : fmt[c] || "General";
      cell.s = {
        numFmt: isDate ? "dd-mmm-yyyy" : fmt[c] || "General",
        alignment: { vertical: "center", horizontal: c === "A" ? "left" : "center" },
        font: { sz: 10, bold: false },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      };
      if (c === "E") cell.s.fill = { patternType: "solid", fgColor: { rgb: "FFF2CC" } };
    }
  }

  const title = ws["A1"];
  title.t = "s";
  title.s = { font: { sz: 14, bold: true }, fill: { patternType: "solid", fgColor: { rgb: "1F4E79" } }, font2: { color: { rgb: "FFFFFF" } }, numFmt: "General" };
  title.s.font.color = { rgb: "FFFFFF" };
  title.s.border = { bottom: { style: "thick", color: { rgb: "000000" } } };

  for (let ci = 0; ci < 23; ci++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 2, c: ci })];
    if (!cell) continue;
    cell.s = {
      font: { bold: true, sz: 10 },
      alignment: { horizontal: "center", vertical: "center" },
      fill: { patternType: "solid", fgColor: { rgb: "DDEBF7" } },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };
  }

  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 22 } }];
  ws["!cols"] = [];
  const widths = [12, 16, 6, 12, 10, 18, 22, 10, 3, 10, 14, 10, 8, 8, 8, 8, 8, 8, 8, 8];
  for (let i = 0; i < 23; i++) {
    ws["!cols"][i] = { wch: widths[i % widths.length] };
  }
  ws["!cols"][8].hidden = false;
  ws["!cols"][15].hidden = true;
  ws["!rows"] = [];
  ws["!rows"][0] = { hpt: 24 };
  for (let r = 3; r < 8; r++) ws["!rows"][r] = { hpt: 15 };
  ws["!rows"][9] = { hpt: 6 };
  ws["!rows"][10] = { hpt: 15 };
  ws["!rows"][11] = { hpt: 15, hidden: true };
  return ws;
}

function buildSheetFromWorkbook(name, ws) {
  const wb = { SheetNames: [name], Sheets: { [name]: ws } };
  const out = importSheetNative(name, wb.Sheets[name], null);
  return out;
}

export async function main() {
  console.log("== 1. Uji importer dengan workbook BOND tiruan ==");
  const ws = buildBondWorkbook();
  const wbuf = XLSX.write({ SheetNames: ["Bond"], Sheets: { Bond: ws } }, { type: "buffer", bookType: "xlsx" });
  fs.writeFileSync(path.join(ANALISIS, "synthetic-bond.xlsx"), wbuf);

  const wb2 = XLSX.read(wbuf, { type: "buffer", cellDates: true, cellStyles: true });
  const sh = importSheetNative("Bond", wb2.Sheets["Bond"], null);
  const fitted = autoFitSheet(sh);

  check("fitted === sh (autoFit no-op untuk native)", fitted === sh);
  check("grid rows >= 8", (sh.rows || []).length >= 8, `rows=${sh.rows.length}`);
  check("grid cols >= 23 (deklarasi file + lantai grid 26)", (sh.columns || []).length >= 23, `cols=${sh.columns.length}`);
  check("grid tidak membengkak dari array !rows/!cols (lantai 50x26)", (sh.rows || []).length === 50 && (sh.columns || []).length === 26, `rows=${sh.rows.length}, cols=${sh.columns.length}`);
  check("merge A1:W1 ada", JSON.stringify(sh.merges || []).includes('\"c2\":22'));
  check("kolom O(15) tersembunyi", sh.columns[15] && sh.columns[15].hidden === true);
  check("kolom kosong M(12) TETAP ADA", !!sh.columns[12], `width=${sh.columns[12] && sh.columns[12].width}`);
  check("kolom kosong I(8) TETAP ADA", !!sh.columns[8]);

  const years = [2008, 2009, 2010, 2008, 2012];
  years.forEach((y, i) => {
    const v = sh.rows[3 + i] && sh.rows[3 + i]["A"];
    check(`baris ${3 + i} kolom A == ${y}`, v === y, `got=${JSON.stringify(v)}`);
  });
  check("A5 == 2009 (posisi persis)", sh.rows[4]["A"] === 2009);
  check("A7 == 2008 (angka diulang di baris beda)", sh.rows[6]["A"] === 2008);
  check("E4 numFmt '0.00%'", sh.rows[3]["__nf_E"] === "0.00%", `got=${sh.rows[3]["__nf_E"]}`);
  check("K4 numFmt '#,##0'", sh.rows[3]["__nf_K"] === "#,##0");
  check("B4 format tanggal dipertahankan", sh.rows[3]["__nf_B"] === "dd-mmm-yyyy");
  check("width kolom A mengikuti file (!cols)", sh.columns[0].width === widthPx(wb2.Sheets["Bond"]["!cols"][0]), `got=${sh.columns[0].width}`);
  check("width kolom kosong I ikut !cols", sh.columns[8].width === widthPx(wb2.Sheets["Bond"]["!cols"][8]), `got=${sh.columns[8].width}`);
  check("height row1 == 32", sh.rows[0].height === Math.round((24 * 96) / 72), `got=${sh.rows[0].height}`);
  check("4.75 height row3..7", [3, 4, 5, 6, 7].every((r) => sh.rows[r].height === Math.round((15 * 96) / 72)));
  check("default row height = 20 (baris tanpa !rows mengikuti default Excel 15pt)", sh.rows[8].height === 20, `got=${sh.rows[8].height}`);
  check("separator row hpt=6 → 8px (bukan dipaksa 20+px)", sh.rows[9].height === 8, `got=${sh.rows[9].height}`);
  check("row hpt=15 → 20px", sh.rows[10].height === 20, `got=${sh.rows[10].height}`);
  check("row hidden flag dipertahankan", sh.rows[11].hidden === true);
  check("lebar kolom BERBEDA per kolom (A narrow != B wide, tidak seragam)", sh.columns[0].width !== sh.columns[1].width && sh.columns[1].width > sh.columns[0].width, `A=${sh.columns[0].width}px B=${sh.columns[1].width}px`);
  check("kolom data tahun (D..T) ikut !cols masing-masing, bukan 64 default semua", sh.columns[3].width === widthPx(wb2.Sheets["Bond"]["!cols"][3]) && sh.columns[3].width !== sh.columns[1].width, `D=${sh.columns[3].width}px`);

  const dA = formatCellValue(sh.rows[3]["A"], { ...sh.columns[0], numFmt: sh.rows[3]["__nf_A"] || sh.columns[0].numFmt });
  check("display tahun '2008'", dA === "2008", `got=${dA}`);
  const dE = formatCellValue(sh.rows[3]["E"], { ...sh.columns[4], numFmt: sh.rows[3]["__nf_E"] || sh.columns[4].numFmt });
  check("display 9% (mengandung 9 dan %) ", dE.includes("9") && dE.includes("%"), `got=${dE}`);
  const dB = formatCellValue(sh.rows[3]["B"], { ...sh.columns[1], numFmt: sh.rows[3]["__nf_B"] || sh.columns[1].numFmt });
  check("display tanggal mengandung 2008", dB.includes("2008"), `got=${dB}`);

  console.log("\nSample baris 4 (screen grid):");
  const keys = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "N"];
  const row = sh.rows[3];
  for (const k of keys) {
    const cv = row[k];
    console.log(`  ${k}4 raw=${JSON.stringify(cv)} nf=${row["__nf_" + k] || "-"} display=${JSON.stringify(formatCellValue(cv, { numFmt: row["__nf_" + k] }))}`);
  }

  console.log("\nUji cabang format lain:");

  let t = formatCellValue(1234.5, { numFmt: "(0.00)" });
  check("(0.00) positif tanpa pengelompokan", t === "(1234.50)", `got=${t}`);
  t = formatCellValue(-1234.5, { numFmt: "(0.00)" });
  check("(0.00) negatif", t === "(1234.50)", `got=${t}`);
  t = formatCellValue(1234.5, { numFmt: "#,##0.00;(#,##0.00)" });
  check("akuntansi positif (#,##0.00)", t === "1.234,50", `got=${t}`);
  t = formatCellValue(-1234.5, { numFmt: "#,##0.00;(#,##0.00)" });
  check("akuntansi negatif dalam kurung + pengelompokan", t === "(1.234,50)", `got=${t}`);
  t = formatCellValue(1234.5, { numFmt: "0.00" });
  check("0.00 tanpa pengelompokan, separator titik (konsisten dgn 9.00%)", t === "1234.50", `got=${t}`);
  t = formatCellValue(0.062, { numFmt: "0.00%" });
  check("0.00% desimal titik", t === "6.20%", `got=${t}`);

  console.log("\nUji debugImportFidelity (alat DEBUG yang diminta user):");
  const fid = debugImportFidelity({ SheetNames: ["Bond"], Sheets: { Bond: ws } });
  check("fidelity Bond sintetis: differences === 0", fid.differences === 0, `differences=${fid.differences}, checked=${fid.checked}`);
  check("fidelity mencakup semua sel (checked>0)", fid.checked > 0, `checked=${fid.checked}`);
  check("merge terhitung: mergeDiff===0", fid.sheets[0].mergeDiff === 0, `mergeDiff=${fid.sheets[0].mergeDiff}`);

  const shiftedWs = XLSX.utils.aoa_to_sheet([
    [],
    [],
    [],
    [],
    ["", "", "", "", "INI MULAI DI C5 (baris 5, kolom C)"],
    ["", "", "Tahun", "Tanggal", "5Y", "FR", "FR %", "End Date", "Harga", "Yield", "", "Notional", "Kupon"],
  ]);
  shiftedWs["B9"] = { t: "n", v: 2008, z: "0" };
  // Catatan: default builder (native) MEMANG 1:1 sehingga differences=0
  // (itu benar). Yang harus terbukti: alat mampu mendeteksi pergeseran dari
  // mesin LAIN — pakai mesin lama berbasis densitas:
  const fidShift = debugImportFidelity({ SheetNames: ["s"], Sheets: { s: shiftedWs } }, {
    builder: (n, wEl) => importSheetFromXLSX(n, wEl, 0, null, null, { keepDefaultColumns: true }),
  });
  check("fidelity mendeteksi pergeseran mesin lama (keepDefaultColumns) — alat tidak palsu", fidShift.differences > 0, `differences=${fidShift.differences}`);

  diffReal();
  console.log(failed === 0 ? "\nSEMUA UJI LULUS" : `\n${failed} UJI GAGAL`);
  process.exit(failed === 0 ? 0 : 1);
}

function diffReal() {
  console.log("\n== 2. Diff file asli (jika ada di _analisis) ==");
  let files;
  try {
    files = fs.readdirSync(ANALISIS).filter((f) => /\.xlsx$/i.test(f) && f !== "synthetic-bond.xlsx");
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.log("(tidak ada file asli — lewati. Taruh file ke _analisis lalu jalankan ulang.)");
    return;
  }
  for (const f of files) {
    console.log(`\n--- ${f} ---`);
    const data = fs.readFileSync(path.join(ANALISIS, f));
    const wb = XLSX.read(data, { type: "buffer", cellDates: true, cellStyles: true });
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const sh = importSheetNative(name, ws, null);
      const raw = flatCells(ws);
      let bad = 0;
      for (const cell of raw) {
        const rv = sh.rows[cell.r] && sh.rows[cell.r][cell.k];
        const same = sameVal(rv, cell.v);
        if (!same) {
          if (bad < 20) console.log(`  BEDA  ${cell.k}${cell.r + 1}: excel=${JSON.stringify(cell.v)} web=${JSON.stringify(rv)}`);
          bad++;
        }
      }
      console.log(`  sheet "${name}": ${raw.length} sel berisi, ${bad} sel berbeda.`);
      const nullMerges = (ws["!merges"] || []).length;
      const shMerges = (sh.merges || []).length;
      console.log(`  merge: excel=${nullMerges} web=${shMerges} (${nullMerges === shMerges ? "sama" : "BEDA"})`);
      const nullCols = (ws["!cols"] || []).length;
      console.log(`  kolom: excelExtent=${nullCols} webCols=${sh.columns.length} rowsExcel=${maxRow(ws)} webRows=${sh.rows.length}`);
    }
  }
}

function flatCells(ws) {
  const out = [];
  for (const k of Object.keys(ws)) {
    if (!/^[A-Z]+[0-9]+$/.test(k)) continue;
    const v = ws[k].v;
    if (v === undefined || v === null) continue;
    const a = XLSX.utils.decode_cell(k);
    out.push({ r: a.r, c: a.c, k: XLSX.utils.encode_col(a.c), v });
  }
  return out;
}

function maxRow(ws) {
  const ref = ws["!ref"];
  if (!ref) return 0;
  try {
    return XLSX.utils.decode_range(ref).e.r + 1;
  } catch {
    return 0;
  }
}

function sameVal(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  return false;
}

main();