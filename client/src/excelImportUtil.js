import * as XLSX from "xlsx-js-style";
import { colName, colIndex, shiftFormulaRefsRowInsert } from "./spreadsheet.js";

const OFFSET_KEY = "sisnerling_row_offsets";
const NATIVE_KEY = "sisnerling_native_sheets";

const DEFAULT_THEME_COLORS = [
  "FFFFFF", "000000", "EEECE1", "1F497D", "4F81BD", "C0504D",
  "9BBB59", "8064A2", "4BACC6", "F79646",
];
const DEFAULT_THEME_COLORS_A = [
  "FFFFFF", "000000", "EEEAF1", "315495", "4472C4", "C00000",
  "70AD47", "5B9BD5", "FFC000", "ED7D31",
];

function themeToHex(theme, tint, themes) {
  if (theme == null) return null;
  if (themes && themes.themeElements && themes.themeElements.clrScheme) {
    const cols = themes.themeElements.clrScheme;
    const names = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
    const clr = cols[names[theme]];
    if (clr) {
      const rgb = clr.srgbClr && clr.srgbClr.val;
      if (rgb) return rfTint(rgb, tint);
      const sys = clr.sysClr && clr.sysClr.lastClr;
      if (sys) return rfTint(sys, tint);
    }
  }
  const fallback = (DEFAULT_THEME_COLORS_A[theme] ?? DEFAULT_THEME_COLORS[theme] ?? "FFFFFF");
  return rfTint(fallback, tint);
}

function rgbToHsl(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
}

function rfTint(hex, tint) {
  if (tint == null || tint === 0) return "#" + hex.replace("#", "");
  let [h, s, l] = rgbToHsl(hex);
  if (tint > 0) {
    l = l * (1 - tint) + (1 * (1 - (1 - tint)));
  } else {
    l = l * (1 + tint);
  }
  return "#" + hslToRgb(h, s, Math.min(1, Math.max(0, l))).map((v) => v.toString(16).padStart(2, "0")).join("");
}

function pickColorFrom(fg, themes) {
  if (!fg) return null;
  if (typeof fg.rgb === "string" && /^#?[0-9A-Fa-f]{6}$/.test(fg.rgb)) {
    return "#" + fg.rgb.replace("#", "").toLowerCase();
  }
  if (typeof fg.rgb === "string" && /^#?[0-9A-Fa-f]{8}$/.test(fg.rgb)) {
    return "#" + fg.rgb.replace("#", "").slice(-6).toLowerCase();
  }
  if (fg.theme != null) return themeToHex(fg.theme, fg.tint, themes);
  if (fg.auto) return null;
  return null;
}

export function cellBgColor(cell, themes) {
  if (!cell || !cell.s) return null;
  // Beberapa versi xlsx-js-style menempatkan properti fill (patternType/fgColor)
  // langsung di cell.s, bukan di cell.s.fill. Tangani kedua bentuk.
  const fill =
    cell.s.fill && typeof cell.s.fill === "object" ? cell.s.fill : cell.s;
  const patternType = fill.patternType;
  if (patternType && patternType !== "solid") return null;
  let color = pickColorFrom(fill.fgColor, themes);
  // Beberapa file menaruh warna solid di bgColor (mis. fill tanpa fgColor).
  if (!color) color = pickColorFrom(fill.bgColor, themes);
  return color || null;
}

export function cellFontColor(cell, themes) {
  if (!cell || !cell.s || !cell.s.font) return null;
  return pickColorFrom(cell.s.font.color, themes) || null;
}

export function cellBorder(cell) {
  if (!cell || !cell.s || !cell.s.border) return null;
  const b = cell.s.border;
  // SheetJS membaca/menulis border dengan kunci top/right/bottom/left; model
  // internal grid memakai t/r/b/l. Terima KEDUANYA supaya border file asli
  // benar-benar ikut terimpor (bukan dibuang diam-diam).
  const key = { t: "top", r: "right", b: "bottom", l: "left" };
  const out = {};
  let any = false;
  for (const k of ["t", "r", "b", "l"]) {
    const s = b[k] || b[key[k]];
    if (!s || !s.style || s.style === "none") continue;
    let c = null;
    if (s.color) {
      if (typeof s.color.rgb === "string" && /^#?[0-9A-Fa-f]{6,8}$/.test(s.color.rgb)) {
        c = "#" + s.color.rgb.replace("#", "").slice(-6);
      } else if (s.color.theme != null) {
        c = themeToHex(s.color.theme, s.color.tint, null);
      }
    }
    // Tebal border mengikuti gaya Excel: thick & double = bingkai tebal (3px),
    // medium* = sedang (2px), sisanya (thin/hair/dotted/dashed) = tipis (1px).
    const excelW = {
      thick: 3,
      double: 3,
      medium: 2,
      mediumDashed: 2,
      mediumDashDot: 2,
      mediumDashDotDot: 2,
      slantDashDot: 2,
      thin: 1,
      hair: 1,
      dotted: 1,
      dashed: 1,
      dashDot: 1,
      dashDotDot: 1,
    };
    out[k] = { c: c || "#000000", w: excelW[s.style] || 1 };
    any = true;
  }
  return any ? out : null;
}

export function cellNumFmt(cell) {
  if (!cell) return null;
  if (cell.s && typeof cell.s.numFmt === "string" && cell.s.numFmt.trim() !== "") {
    return cell.s.numFmt;
  }
  if (typeof cell.z === "string" && cell.z.trim() !== "") return cell.z;
  return null;
}

export function createEmptySheet(name) {
  const columns = [];
  for (let i = 0; i < 26; i++) {
    columns.push({ key: colName(i), label: colName(i), type: "text", width: 100 });
  }
  const rows = [];
  for (let r = 0; r < 20; r++) {
    const row = { id: `row_${name}_${r}` };
    for (const c of columns) row[c.key] = "";
    rows.push(row);
  }
  return { name, rows, columns, firstRow: 1 };
}

// Sheet dianggap KOSONG bila tidak ada satu pun sel berisi (nilai/rumus/gaya)
// maupun merge. Sheet kosong selalu diganti createEmptySheet (26 kolom, 20 baris)
// agar editor dan hasil impor tidak pernah tampil "1 baris 1 kolom" / seperti data
// yang hilang. Gaya (__*) yang tersisa dihitung sebagai isi agar format lama tetap
// dipertahankan.
function sheetLooksEmpty(sh) {
  if (!sh) return true;
  if (sh.merges && sh.merges.length) return false;
  const rows = sh.rows || [];
  for (const row of rows) {
    if (!row) continue;
    for (const k in row) {
      if (k === "id" || k === "height") continue;
      const v = row[k];
      if (v === null || v === undefined || v === "") continue;
      return false;
    }
  }
  return true;
}

const MAX_NATIVE_ROWS = 10000;
const MAX_NATIVE_COLS = 676;

// Cell dianggap "berisi" bila punya nilai, rumus, komentar, hyperlink, ATAU gaya
// (fill/font/border/alignment/numFmt/protection). Ini menjaga area tabel yang
// hanya berformat/berkomentar (mis. region ber-border kosong) tetap ikut
// terimport tanpa mengubah posisi — data tabel TIDAK pernah terpotong sebagian.
function cellHasContent(cell) {
  if (!cell) return false;
  if (cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== "") return true;
  if (typeof cell.f === "string" && cell.f.trim() !== "") return true;
  if (cell.c) return true; // komentar
  if (cell.l) return true; // hyperlink
  const s = cell.s || {};
  return !!(s.fill || s.font || s.border || s.alignment || s.numFmt || s.protection);
}

/**
 * Impor FAITHFUL (1:1) dari sebuah sheet file Excel.
 *
 * Tidak ada deteksi template, tidak ada baris yang dibuang/digeser, tidak ada
 * penggantian header. Koordinat grid == koordinat file (baris grid r == baris
 * Excel r+1, kolom grid c == kolom Excel c+1), sehingga:
 *   - semua baris/kolom (termasuk teks judul, header bertingkat, baris kosong
 *     di tengah tabel) dipertahankan pada posisinya;
 *   - merge, rumus, warna, border, font, alignment, wrap, lebar kolom, tinggi
 *     baris adalah milik cell aslinya;
 *   - ekspor hanya perlu menulis balik langsung 1:1.
 * Baris/kolom kosong tetap dibawa SELURUHNYA (seluas rentang dipakai file,
 * plus grid kosong minimum) — baris/kolom di bawah dan kanan tabel tidak
 * pernah dihapus sehingga spreadsheet tetap berfungsi seperti Excel asli.
 */
export function importSheetNative(sheetName, sheet, themes) {
  const fileCols = Array.isArray(sheet["!cols"]) ? sheet["!cols"] : [];
  const fileRows = Array.isArray(sheet["!rows"]) ? sheet["!rows"] : [];
  const mergesF = Array.isArray(sheet["!merges"]) ? sheet["!merges"] : [];
const ref = sheet["!ref"];
  const range = ref ? XLSX.utils.decode_range(ref) : null;

  let lastR = -1;
  let lastC = -1;
  // Pindai hanya sel yang BENAR-BENAR ADA (kunci alamat), bukan seluruh rentang
  // !ref. !ref bisa membengkak jauh dari data (seleksi/format diterapkan jauh di
  // bawah/kanan) sehingga memindai rentang itu menggantung; batas grid dihitung
  // dari isi sungguhan + merge + sel yang punya style saja.
  for (const key of Object.keys(sheet)) {
    if (!/^[A-Z]{1,3}\d+$/.test(key)) continue;
    if (!cellHasContent(sheet[key])) continue;
    const addr = XLSX.utils.decode_cell(key);
    if (addr.r > lastR) lastR = addr.r;
    if (addr.c > lastC) lastC = addr.c;
  }
  for (const m of mergesF) {
    if (m && typeof m.s?.r === "number" && typeof m.e?.r === "number") {
      if (m.e.r > lastR) lastR = m.e.r;
      if (m.e.c > lastC) lastC = m.e.c;
    }
  }
  // Hargai bentang (extent) yang DEKLARASIKAN file (!ref) selama wajar. Ini
  // menjaga jumlah baris/kolom dan luas area layout kosong mengikuti Excel
  // asli (mis. sheet berformat 1000 baris, kolom hingga AC yang hanya berisi
  // layout). Batas atas mencegah seleksi seluruh-sheet raksasa (XFD/1048576).
  const EXTENT_MAX_ROWS = 10000;
  const EXTENT_MAX_COLS = 676;
  if (range && Number.isFinite(range.e.r)) {
    const refRows = range.e.r + 1;
    if (refRows > lastR + 1 && refRows <= EXTENT_MAX_ROWS) lastR = range.e.r;
  }
  if (range && Number.isFinite(range.e.c)) {
    const refCols = range.e.c + 1;
    if (refCols > lastC + 1 && refCols <= EXTENT_MAX_COLS) lastC = range.e.c;
  }

  // Ukuran grid := batas yang DIDEKLARASIKAN FILE (isi + merge + !ref +
  // baris/kolom yang BENAR-BENAR dideklarasikan propertinya di `!rows`/`!cols`),
  // DENGAN lantai minimum 26x50 — grid kosong di bawah/kanan tabel tetap ada
  // seperti Excel asli dan tidak pernah terpotong. Indeks yang dianggap adalah
  // entri sungguhan (bukan `undefined` hole), jadi array `!rows`/`!cols` yang
  // jarang/telanjur panjang tidak bisa meledakkan jumlah baris/kolom.
  const GRID_MIN_ROWS = 50;
  const GRID_MIN_COLS = 26;
  const lastRealRowIdx = fileRows.reduce((mx, e, i) => (e ? i : mx), -1);
  const lastRealColIdx = fileCols.reduce((mx, e, i) => (e ? i : mx), -1);
  let nRows = Math.min(
    MAX_NATIVE_ROWS,
    Math.max(lastR + 1, lastRealRowIdx + 1, GRID_MIN_ROWS)
  );
  let nCols = Math.min(
    MAX_NATIVE_COLS,
    Math.max(lastC + 1, lastRealColIdx + 1, GRID_MIN_COLS)
  );
  if (nRows <= 0) nRows = GRID_MIN_ROWS;
  if (nCols <= 0) nCols = GRID_MIN_COLS;

  const widthPx = (fc) => {
    // Lebar persis dari file, per KOLOM: prioritas wpx (penulis file sudah
    // menyimpan piksel), lalu wch (karakter → piksel rumus Excel), lalu width
    // karakter. Kolom yang tidak diset mengikuti default Excel (64px).
    const fcChars = typeof fc.width === "number" && fc.width > 0 ? fc.width : null;
    const px =
      fc.wpx ||
      (typeof fc.wch === "number" && fc.wch > 0 ? Math.round(fc.wch * 7 + 5) : 0) ||
      (fcChars ? Math.round(fcChars * 7 + 5) : 0);
    if (px > 0) return Math.max(6, Math.min(1200, Math.round(px)));
    return 64;
  };

  // Tinggi baris bawaan Excel bila file tidak mendeklarasikan hpt untuk baris
  // itu (15pt ≈ 20px). Baris yang DEKLARASIKAN memakai hpt persisnya.
  const DEFAULT_ROWS_HPT = 15;

  const columns = [];
  const numCount = {};
  const fmtTally = {};
  for (let i = 0; i < nCols; i++) {
    const fc = fileCols[i] || {};
    const col = {
      key: colName(i),
      label: colName(i),
      type: "text",
      width: widthPx(fc),
      manual: true,
    };
    if (fc.hidden) col.hidden = true;
    columns.push(col);
  }

  const rows = [];
  let formulaCount = 0;
  for (let r = 0; r < nRows; r++) {
    const row = { id: `row_${sheetName}_${r}` };
    const rh = fileRows[r] || {};
    // Tinggi baris mengikuti file asli UNTUK SEMUA baris: hpt persis bila
    // dideklarasikan (termasuk separator tipis 4–8pt), default 15pt bila tidak.
    // Bawah hanya membuang tinggi 0/negatif, atas ~600px (Excel maks 409,5pt).
    const hpt = typeof rh.hpt === "number" && rh.hpt > 0 ? rh.hpt : DEFAULT_ROWS_HPT;
    row.height = Math.max(4, Math.min(600, Math.round((hpt * 96) / 72)));
    if (rh.hidden) row.hidden = true;
    for (let c = 0; c < nCols; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const k = colName(c);
      let val = "";
      if (cell) {
        if (typeof cell.f === "string" && cell.f.trim() !== "") {
          val = "=" + cell.f.trim();
          formulaCount++;
          // Simpan NILAI CACHED hasil Excel (cell.v) sebagai cadangan tampilan.
          // Rumus tetap disimpan utuh ("=SUM(...)"); nilai ini hanya dipakai
          // bila evaluasi rumus klien gagal (mis. fungsi yang belum didukung),
          // sehingga tampilan tidak berubah jadi #VALUE! dan data tidak diganti.
          const _cv = cell.v;
          if (_cv !== null && _cv !== undefined && _cv !== "" && !(typeof _cv === "string" && _cv.startsWith("#"))) {
            row["__cv_" + k] = _cv;
          }
        } else {
          val = cell.v === null || cell.v === undefined ? "" : cell.v;
        }
        if (val !== "" && val !== null && val !== undefined) row[k] = val;
        const bg = cellBgColor(cell, themes);
        if (bg && bg !== "#ffffff") row["__" + k] = bg;
        const s = cell.s || {};
        const font = s.font || {};
        if (font.bold) row["__b_" + k] = true;
        if (font.italic) row["__i_" + k] = true;
        if (font.underline) row["__u_" + k] = true;
        if (typeof font.sz === "number" && font.sz > 0 && font.sz !== 11) row["__sz_" + k] = font.sz;
        if (typeof font.name === "string" && font.name.trim() !== "") row["__fn_" + k] = font.name;
        const fcColor = pickColorFrom(font.color, themes);
        if (fcColor) row["__fc_" + k] = fcColor;
        const al = s.alignment;
        if (al) {
          if (al.horizontal) row["__ha_" + k] = al.horizontal;
          if (al.vertical) row["__va_" + k] = al.vertical === "center" ? "middle" : al.vertical;
          if (al.wrapText) row["__wr_" + k] = true;
        }
        const bd = cellBorder(cell);
        if (bd) row["__bd_" + k] = bd;
        const nf = cellNumFmt(cell);
        if (nf) row["__nf_" + k] = nf;
        if (typeof cell.v === "number") {
          numCount[k] = (numCount[k] || 0) + 1;
          if (nf) {
            if (!fmtTally[k]) fmtTally[k] = {};
            fmtTally[k][nf] = (fmtTally[k][nf] || 0) + 1;
          }
        }
      }
      if (val === "" && !(k in row)) row[k] = "";
    }
    rows.push(row);
  }

  for (const col of columns) {
    const k = col.key;
    if ((numCount[k] || 0) > 0) col.type = "number";
    const tally = fmtTally[k];
    if (tally) {
      let best = null;
      let bn = 0;
      for (const f in tally) {
        if (tally[f] > bn) {
          bn = tally[f];
          best = f;
        }
      }
      if (best && /[#0.]/.test(best) && !/^@/.test(best)) col.numFmt = best;
    }
  }

  const merges = [];
  for (const m of mergesF) {
    if (!m || typeof m.s?.r !== "number") continue;
    if (m.s.r < 0 || m.s.c < 0 || m.e.r >= nRows || m.e.c >= nCols) continue;
    if (m.e.r < m.s.r || m.e.c < m.s.c) continue;
    merges.push({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c });
  }

  const out = { name: sheetName, rows, columns, firstRow: 1, native: true };
  if (formulaCount > 0) out.__formulaCount = formulaCount;
  if (merges.length) out.merges = merges;
  const freeze = sheet && sheet["!freeze"];
  if (freeze && typeof freeze.xSplit === "number" && typeof freeze.ySplit === "number") {
    out.freeze = {
      xSplit: freeze.xSplit,
      ySplit: freeze.ySplit,
      ...(freeze.topLeftCell ? { topLeftCell: freeze.topLeftCell } : {}),
    };
  }
  return out;
}

// Terapkan gaya hasil import ke satu cell saat mengekspor ulang ke XLSX.
// Koordinat tidak perlu dipetakan ulang: sheet native = 1:1.
function applyNativeExportStyle(row, c) {
  const style = {};
  const k = c.key;
  const bg = row["__" + k];
  if (bg && bg !== "#ffffff") {
    style.fill = { patternType: "solid", fgColor: { rgb: bg.replace("#", "").toUpperCase() } };
  }
  const bold = row["__b_" + k];
  const italic = row["__i_" + k];
  const un = row["__u_" + k];
  const fc = row["__fc_" + k];
  const sz = row["__sz_" + k];
  const fn = row["__fn_" + k];
  if (bold || italic || un || fc || sz || fn) {
    const font = {};
    if (bold) font.bold = true;
    if (italic) font.italic = true;
    if (un) font.underline = true;
    if (fc) font.color = { rgb: fc.replace("#", "").toUpperCase() };
    if (sz) font.sz = sz;
    if (fn) font.name = fn;
    style.font = font;
  }
  const ha = row["__ha_" + k];
  const va = row["__va_" + k];
  const wr = row["__wr_" + k];
  if (ha || va || wr) {
    style.alignment = {
      ...(ha ? { horizontal: ha } : {}),
      ...(va ? { vertical: va === "middle" ? "center" : va } : {}),
      ...(wr ? { wrapText: true } : {}),
    };
  }
  const brd = row["__bd_" + k];
  if (brd && typeof brd === "object") {
    const border = {};
    const fileKey = { t: "top", r: "right", b: "bottom", l: "left" };
    for (const side of ["t", "r", "b", "l"]) {
      const s = brd[side];
      if (!s) continue;
      border[fileKey[side]] = {
        style: s.w >= 3 ? "thick" : s.w >= 2 ? "medium" : "thin",
        color: { rgb: (s.c || "#000000").replace("#", "").toUpperCase() },
      };
    }
    if (Object.keys(border).length) style.border = border;
  }
  const nf = row["__nf_" + k] || c.numFmt;
  const v = row[k];
  const numCell = typeof v === "number" || (typeof v === "string" && v.startsWith("="));
  if (typeof nf === "string" && numCell) style.numFmt = nf;
  return style;
}

// Otomatis menyesuaikan lebar kolom & tinggi baris agar pas dengan isi sel,
// seperti AutoFit di Excel. Karena hanya menjalankan pengukuran teks, fungsi
// ini membutuhkan browser (canvas). Hasilnya compact & rapi:
//   - lebar kolom mengikuti isi (tidak terlalu lebar untuk sel kosong/tipis,
//     tidak terlalu sempit untuk teks panjang);
//   - tinggi baris mengikuti isi hanya untuk sel ber-mode Wrap Text (perilaku
//     Excel), dengan batas maksimal agar baris tidak meledak terlalu tinggi.
export function autoFitSheet(sheet) {
  if (!sheet || typeof document === "undefined" || !document.createElement) return sheet;
  // Sheet hasil impor (native) SUDAH membawa ukuran Excel asli (lebar kolom dari
  // !cols, tinggi baris dari !rows) dan grid kosong di bawah/kanan tabel. Auto-fit
  // tidak diterapkan agar tidak menggelembungkan baris wrap / mengubah proporsi —
  // dimensi mengikuti file asli apa adanya. Auto-fit hanya dipakai untuk sheet
  // yang dibuat manual (tanpa flag native).
  if (sheet.native) return sheet;
  const cols = sheet.columns || [];
  const rows = sheet.rows || [];
  if (!cols.length || !rows.length) return sheet;

  const PAD_H = 12;
  const PAD_V = 4;
  const LINE_H = 16.8;
  const MIN_W = 34;
  const MAX_W = 620;
  const MIN_H = 20;
  const MAX_H = 160;
  // Untuk sheet berjenis panduan (README), tinggi baris dijaga tetap kompak
  // (≤ ~3 baris teks) supaya jarak antarbaris tidak lebar. Teks lebih memanjang
  // tetap tampil utuh karena sel grid overflow:visible (tidak terpotong).
  const isReadmeSheet = /read\s*[-_.]?\s*me|readme/i.test(String(sheet.name || ""));
  const MAX_WRAP_H = isReadmeSheet ? 56 : MAX_H;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "12px 'Segoe UI', Calibri, Arial, sans-serif";
  const textW = (t) => (t ? ctx.measureText(String(t)).width : 0);

  const wraps = (text, maxW) => {
    if (!text || maxW <= 0) return 1;
    const rawLines = String(text).split("\n");
    let total = 0;
    for (const seg of rawLines) {
      if (seg === "") {
        total += 1;
        continue;
      }
      const words = seg.split(/(\s+)/);
      let lineW = 0;
      let lines = 1;
      for (const w of words) {
        const wW = textW(w);
        if (lineW + wW > maxW && lineW > 0) {
          lines++;
          lineW = wW;
        } else lineW += wW;
      }
      total += lines === 0 ? 1 : lines;
    }
    return total === 0 ? 1 : total;
  };

  const mergeMap = new Map();
  (sheet.merges || []).forEach((m) => {
    for (let r = m.r1; r <= m.r2; r++) {
      for (let c = m.c1; c <= m.c2; c++) mergeMap.set(`${r},${c}`, m);
    }
  });

  // Kebutuhan lebar dari isi sel (untuk sel merge dibagi rata ke kolom yang dilebarkan).
  const contentWidth = cols.map((c, ci) => {
    let maxW = 0;
    rows.forEach((row, ri) => {
      if (!row) return;
      const m = mergeMap.get(`${ri},${ci}`);
      if (m && (m.r1 !== ri || m.c1 !== ci)) return;
      const v = row[c.key];
      if (v === null || v === undefined || v === "") return;
      let span = 1;
      if (m && m.c1 === ci) span = m.c2 - m.c1 + 1;
      const w = (textW(v) + PAD_H) / span;
      if (w > maxW) maxW = w;
    });
    return maxW;
  });

  // Lebar final:
  //   - kolom hasil import (manual) mempertahankan lebar file aslinya 1:1
  //     (`c.width`), tanpa diperlebar oleh isi — persis seperti Excel yang
  //     menampilkan teks panjang meluber/ter-wrap di lebar aslinya;
  //   - kolom sheet yang dibuat (tanpa flag manual) baru di-autofit agar pas
  //     dengan isi/header, supaya tabel manual tetap tampak rapi.
  const headerW = cols.map((c, ci) => (c && c.label ? textW(String(c.label)) : 0));
  const widths = cols.map((c, ci) => {
    const fileW = c.width && c.width > 0 ? c.width : 0;
    // Kolom hasil import: lebar file asli dipertahankan persis (1:1). Batasnya
    // dilonggarkan (tidak dpotong ke 620px) agar kolom lebar seperti judul README
    // tetap mengikuti proporsi file asli.
    if (c.manual && fileW > 0) return Math.max(20, Math.min(1400, fileW));
    const baseNeed = Math.max(headerW[ci] + PAD_H, contentWidth[ci] || 0);
    const need = baseNeed <= 0 && fileW > 0 ? Math.min(fileW, 200) : baseNeed;
    return Math.max(MIN_W, Math.min(MAX_W, Math.max(fileW, Math.ceil(need))));
  });

  // Tinggi baris mengikuti file aslinya; hanya baris yang TIDAK diberi tinggi
  // oleh file yang dihitung dari kebutuhan isi sel wrap (lihat komentar di loop).
  const heights = rows.map((row, ri) => {
    if (!row) return undefined;
    let maxH = 0;
    cols.forEach((col, ci) => {
      const m = mergeMap.get(`${ri},${ci}`);
      if (m && (m.r1 !== ri || m.c1 !== ci)) return;
      if (!row["__wr_" + col.key]) return;
      const v = row[col.key];
      if (v === null || v === undefined || v === "") return;
      let effW = widths[ci];
      if (m && m.c1 === ci) for (let c = ci + 1; c <= m.c2; c++) effW += widths[c];
      const contentW = effW - PAD_H;
      if (contentW <= 0) return;
      const lines = wraps(v, contentW);
      maxH = Math.max(maxH, Math.ceil(lines * LINE_H) + PAD_V);
    });
    // Tinggi baris mengikuti file aslinya (SheetJS `!rows` hpt). Bila file
    // MENETAPKAN tinggi baris itu, tingginya dihormati apa adanya dan TIDAK
    // dinaikkan lagi oleh isi yang ter-wrap — persis perilaku Excel yang tidak
    // menambah tinggi baris yang sudah diatur manual. Sel di grid bersifat
    // overflow:visible, jadi teks yang lebih tinggi tetap tampil (tidak
    // terpotong) meski barisnya pendek. Bila file TIDAK menetapkan tinggi
    // (baris otomatis), baru dihitung dari kebutuhan isi wrap.
    const fileH = row.height && row.height > 0 ? Math.min(row.height, MAX_H) : 0;
    if (fileH > 0) return Math.max(MIN_H, fileH);
    return Math.max(MIN_H, Math.min(MAX_WRAP_H, maxH));
  });

  return {
    ...sheet,
    columns: cols.map((c, i) => ({ ...c, width: widths[i] })),
    rows: rows.map((row, i) => {
      if (!row) return row;
      const h = heights[i];
      return h !== undefined ? { ...row, height: h } : row;
    }),
  };
}

// Ubah referensi sel/rentang pada rumus agar tetap valid setelah import.
export function rewriteFormulaRefs(formula, ownOffsetCol, ownOffsetRow, offsetForSheet) {
  if (!formula) return formula;
  const n = formula.length;
  let out = "";
  let i = 0;
  let cur = { offsetCol: ownOffsetCol, offsetRow: ownOffsetRow };
  const isBoundary = (ch) => ",()+-*/^%&<>=;".includes(ch) || /\s/.test(ch);
  while (i < n) {
    const ch = formula[i];
    if (ch === "'") {
      const close = formula.indexOf("'", i + 1);
      if (close >= 0) {
        const name = formula.slice(i + 1, close);
        out += formula.slice(i, close + 1);
        i = close + 1;
        if (formula[i] === "!") {
          out += "!";
          i++;
          const t = offsetForSheet ? offsetForSheet(name) : null;
          cur = t || { offsetCol: ownOffsetCol, offsetRow: ownOffsetRow };
        }
        continue;
      }
    }
    const sheetM = /^([A-Za-z_][A-Za-z0-9_.]*)!/.exec(formula.slice(i));
    if (sheetM) {
      out += sheetM[0];
      i += sheetM[0].length;
      const t = offsetForSheet ? offsetForSheet(sheetM[1]) : null;
      cur = t || { offsetCol: ownOffsetCol, offsetRow: ownOffsetRow };
      continue;
    }
    const refM = /^\$?[A-Za-z]{1,4}\$?\d+/.exec(formula.slice(i));
    if (refM) {
      const ref = refM[0];
      const absCol = ref.startsWith("$");
      const withoutColAbs = absCol ? ref.slice(1) : ref;
      const atRowAbs = withoutColAbs.indexOf("$");
      const colStr = atRowAbs >= 0 ? withoutColAbs.slice(0, atRowAbs) : withoutColAbs.replace(/\d+$/, "");
      const rowM = /\d+$/.exec(withoutColAbs);
      const rowNum = rowM ? parseInt(rowM[0], 10) : 1;
      const colIdx = colIndex(colStr);
      const localCol = colName(colIdx - cur.offsetCol);
      let newRef = absCol ? "$" : "";
      newRef += localCol;
      if (atRowAbs >= 0) newRef += "$";
      newRef += Math.max(1, rowNum - cur.offsetRow);
      out += newRef;
      i += ref.length;
      continue;
    }
    if (isBoundary(ch)) {
      cur = { offsetCol: ownOffsetCol, offsetRow: ownOffsetRow };
    }
    out += ch;
    i++;
  }
  return out;
}

function cellIsEmpty(cell) {
  return !cell || cell.v === null || cell.v === undefined || String(cell.v).trim() === "";
}

// Reparasi otomatis file yang "rusak" oleh bug lama: label kolom otomatis (A,B,C,..)
// pernah tersimpan sebagai data sehingga seluruh isi sheet hanya huruf tunggal
// (mis. kolom "A" penuh dengan "A") dan bertambah setiap kali disimpan.
// Sheet seperti itu dianggap kosong untuk menghindari teks otomatis tanpa isi user.
function isSingleLettersOnlySheet(sheet, range) {
  const totalCells = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
  if (totalCells > 60000) return false;
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cellIsEmpty(cell)) continue;
      if (cell.f) return false;
      if (typeof cell.v === "number") return false;
      if (typeof cell.v !== "string") return false;
      if (!/^[A-Z]{1,3}$/.test(cell.v.trim())) return false;
    }
  }
  return true;
}

/**
 * Deteksi struktur sheet:
 * - maxCols: lebar efektif (kolom dengan isi di >=2 baris, atau jangkauan header),
 *   membuang kolom liar yang hanya berisi satu sel di pojok jauh.
 * - dataStart: baris data pertama (mengandung angka), mengabaikan baris kode-huruf (A,B,C,D…)
 *   dan baris judul.
 * - headerRowIdx: baris header sesungguhnya (yang terdekat di atas data, bukan baris judul
 *   satu-sel, bukan baris huruf A-Z, bukan baris angka semua).
 * - firstRow: nomor baris asli di Excel (1-based) untuk baris data pertama.
 */
export function detectSheetLayout(sheet) {
  const ref = sheet["!ref"];
  const range = ref ? XLSX.utils.decode_range(ref) : null;
  if (!range) {
    return { range: null, offsetCol: 0, dataStart: 0, headerRowIdx: null, maxCols: 1, firstRow: 1 };
  }
  if (isSingleLettersOnlySheet(sheet, range)) {
    return { range: null, offsetCol: 0, dataStart: 0, headerRowIdx: null, maxCols: 1, firstRow: 1 };
  }
  const offsetCol = range.s.c;
  const getV = (r, local) => {
    const c = sheet[XLSX.utils.encode_cell({ r, c: offsetCol + local })];
    return cellIsEmpty(c) ? "" : c.v;
  };

  const maxSurveyRow = Math.min(range.e.r, range.s.r + 3000);

  // Kepadatan isi per kolom (>=2 baris berisi = kolom nyata). Menghilangkan kolom
  // "liar" di pojok jauh yang hanya berisi 1 sel.
  const density = {};
  for (let r = range.s.r; r <= maxSurveyRow; r++) {
    for (let ci = range.s.c; ci <= range.e.c; ci++) {
      if (!cellIsEmpty(sheet[XLSX.utils.encode_cell({ r, c: ci })])) {
        const local = ci - range.s.c;
        density[local] = (density[local] || 0) + 1;
      }
    }
  }
  let lastDense = -1;
  for (const k in density) {
    if (density[k] >= 2) lastDense = Math.max(lastDense, parseInt(k, 10));
  }

  // Jangkauan kolom pada area judul/header (50 baris pertama, bukan 8) — agar kolom
  // tidak terpotong saat header/judul cukup panjang (mis. blok judul menggabung banyak
  // kolom) atau saat tabel data-nya tipis. Baris kode-huruf (A,B,C,D…) tetap diabaikan
  // supaya set kolom huruf dari template tidak menambah kolom kosong.
  let headerAreaExtent = -1;
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 50); r++) {
    let rowExtent = -1;
    let rowNonEmpty = 0;
    let rowLetters = 0;
    for (let ci = range.s.c; ci <= range.e.c; ci++) {
      const vRaw = sheet[XLSX.utils.encode_cell({ r, c: ci })]?.v;
      const v = vRaw === null || vRaw === undefined ? "" : String(vRaw).trim();
      if (v !== "") {
        rowExtent = Math.max(rowExtent, ci - range.s.c);
        rowNonEmpty++;
        if (/^[A-Z]{1,3}$/.test(v)) rowLetters++;
      }
    }
    if (rowNonEmpty > 0 && rowLetters === rowNonEmpty) continue;
    headerAreaExtent = Math.max(headerAreaExtent, rowExtent);
  }

  // Kolom yang "terisi" lewat gabungan sel (merge) juga dihitung sebagai kolom nyata,
  // sehingga tabel berspan lebar (mis. legend/instruksi berkolom banyak di file asli)
  // tidak dipotong menjadi kolom A-B saja. Pita judul/banner — satu baris penuh lebar
  // di area paling atas — tetap dikecualikan karena itu ditangani sebagai banner.
  const mergedWidths = Array.isArray(sheet["!merges"]) ? sheet["!merges"] : [];
  const usedW = range.e.c - range.s.c + 1;
  let mergeWidth = 0;
  for (const m of mergedWidths) {
    if (typeof m.s?.c !== "number" || typeof m.e?.c !== "number") continue;
    const w = m.e.c - m.s.c + 1;
    if (w < 3) continue;
    const bannerBand = m.e.r - m.s.r === 0 && m.s.r <= range.s.r + 2 && w >= usedW * 0.6;
    if (bannerBand) continue;
    mergeWidth = Math.max(mergeWidth, m.e.c - range.s.c + 1);
  }

  // Batas wajar jumlah kolom (260) agar sel "liar" di pojok jauh (mis. cell ber-format
  // di kolom XFD) tidak meledakkan grid menjadi ribuan kolom.
  const maxCols = Math.min(Math.max(lastDense + 1, headerAreaExtent + 1, mergeWidth, 1), 260);

  const rowVals = (r) => {
    const vals = [];
    for (let i = 0; i < maxCols; i++) vals.push(getV(r, i));
    return vals;
  };

  const isSingleLetter = (v) => typeof v === "string" && /^[A-Z]{1,3}$/.test(v.trim());

  // Baris berisi angka = kandidat data. Baris kode-huruf (A,B,C,D…) tidak dihitung.
  const rowIsNumericData = (vals) => {
    let nonEmpty = 0;
    let num = 0;
    let letters = 0;
    for (const v of vals) {
      if (v === "") continue;
      nonEmpty++;
      if (typeof v === "number" || !isNaN(Number(String(v).trim()))) num++;
      else if (isSingleLetter(v)) letters++;
    }
    if (nonEmpty === 0 || num < 1) return false;
    if (letters === nonEmpty) return false;
    return true;
  };

  const rowIsAllSingleLetters = (vals) => {
    let nonEmpty = 0;
    let letters = 0;
    for (const v of vals) {
      if (v === "") continue;
      nonEmpty++;
      if (isSingleLetter(v)) letters++;
    }
    return nonEmpty > 0 && letters === nonEmpty;
  };

  const rowIsAllNumeric = (vals) => {
    let nonEmpty = 0;
    let num = 0;
    for (const v of vals) {
      if (v === "") continue;
      nonEmpty++;
      const s = String(v).trim();
      if (typeof v === "number" || (!isNaN(Number(s)) && s !== "")) num++;
    }
    return nonEmpty > 0 && nonEmpty === num;
  };

  // 1) Pencarian data via baris berisi angka (mempertahankan deteksi header yang benar
  //    untuk file numerik, judul bertingkat, kolom jauh, dst).
  let dataStart = -1;
  for (let r = range.s.r; r <= maxSurveyRow; r++) {
    const vals = rowVals(r);
    if (rowIsNumericData(vals)) {
      dataStart = r;
      break;
    }
  }

  // 2) Tanpa baris angka sama sekali (file teks murni / grid kosong yang diteks saja),
  //    ambil baris pertama yang tidak kosong, bukan baris huruf (A,B,C…) dan bukan
  //    baris angka-murni. Ini mencegah baris header huruf "A,B,C…" ikut terhitung sebagai
  //    data sehingga jumlah baris "bertambah" setiap file dialihkan.
  if (dataStart < 0) {
    for (let r = range.s.r; r <= maxSurveyRow; r++) {
      const vals = rowVals(r);
      if (vals.every((v) => v === "")) continue;
      if (rowIsAllSingleLetters(vals)) continue;
      if (rowIsAllNumeric(vals)) continue;
      dataStart = r;
      break;
    }
  }
  if (dataStart < 0) dataStart = range.s.r;

  // Pilih baris header terbaik dari 6 baris di atas data pertama.
  let headerRowIdx = null;
  let bestScore = -1;
  for (let r = dataStart - 1; r >= Math.max(range.s.r, dataStart - 6); r--) {
    const vals = rowVals(r);
    const ne = vals.filter((v) => v !== "");
    if (ne.length === 0) continue;
    const allLetters = ne.length >= 2 && ne.every((v) => isSingleLetter(v));
    const allNumeric = ne.length >= 1 && ne.every((v) => typeof v === "number" || !isNaN(Number(String(v).trim())));
    if (allLetters) continue;
    if (allNumeric) continue;
    const score = ne.length;
    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = r;
    }
  }

  return { range, offsetCol, dataStart, headerRowIdx, maxCols, firstRow: dataStart + 1 };
}

export function importSheetFromXLSX(sheetName, sheet, offsetForSheet, storedFirstRow, themes, opts = {}) {
  const layout = detectSheetLayout(sheet);
  let { range, offsetCol, dataStart, headerRowIdx, maxCols } = layout;
  if (!range) return createEmptySheet(sheetName);
  const bannerRowFlexible = opts.bannerRowFlexible !== false;

  // Lebar tabel asli (hasil deteksi layout) dipakai sebagai dasar seleksi judul/banner,
  // agar judul lebar tetap terdeteksi walau grid kolom dipaksa menjadi A-Z (26 kolom).
  const tableWidth = maxCols;

  // keepDefaultColumns: kolom tetap A,B,C,D,... (tidak mengikuti header file import).
  // Letak tabel dipertahankan terhadap file asli: baris paling atas yang di-merge lebar
  // (banner/judul) ditampilkan sebagai pita judul di atas grid, sedangkan baris-baris
  // lain (header file, dst.) tetap diimpor sebagai data. Baris kosong dan baris
  // pseudo-header huruf tunggal (A,B,C,...) hasil simpan sheetsToWorkbook dilewati.
  if (opts.keepDefaultColumns) {
    // 1) Baris paling atas yang di-merge >60% lebar tabel dianggap area judul/banner.
    let bannerBottom = -1;
    const bMerges = Array.isArray(sheet["!merges"]) ? sheet["!merges"] : [];
    const bWide = bMerges.filter(
      (m) => m.e.r < dataStart && m.e.r >= range.s.r && m.e.c - m.s.c + 1 >= Math.min(tableWidth, 260) * 0.6
    );
    if (bWide.length) {
      const top = Math.min(...bWide.map((m) => m.s.r));
      const winner = bWide.find((m) => m.s.r === top);
      if (winner) bannerBottom = winner.e.r;
    }
    // 2) Data mulai tepat setelah banner: lewati baris kosong dan baris huruf tunggal.
    let start = bannerBottom + 1;
    const endScan = Math.min(range.e.r, range.s.r + 3000);
    while (start <= endScan) {
      let nonEmpty = 0;
      let letters = 0;
      for (let ci = range.s.c; ci <= range.e.c; ci++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: start, c: ci })];
        const v = cellIsEmpty(cell) ? "" : String(cell.v).trim();
        if (v === "") continue;
        nonEmpty++;
        if (/^[A-Z]{1,3}$/.test(v)) letters++;
      }
      if (nonEmpty > 0 && letters !== nonEmpty) break;
      start++;
    }
    if (start > range.e.r) start = dataStart;
    dataStart = start;
    headerRowIdx = null;
    maxCols = Math.max(26, range.e.c - range.s.c + 1, tableWidth);
  }

  const getV = (r, local) => {
    const c = sheet[XLSX.utils.encode_cell({ r, c: offsetCol + local })];
    return cellIsEmpty(c) ? "" : c.v;
  };

  const headerVals = headerRowIdx !== null ? Array.from({ length: maxCols }, (_, i) => getV(headerRowIdx, i)) : [];

const headerBg = [];
  if (headerRowIdx !== null) {
    for (let i = 0; i < maxCols; i++) {
      const hc = sheet[XLSX.utils.encode_cell({ r: headerRowIdx, c: offsetCol + i })];
      headerBg.push(cellBgColor(hc, themes));
    }
  }

  const fileCols = Array.isArray(sheet["!cols"]) ? sheet["!cols"] : [];
  const columns = [];
  for (let i = 0; i < maxCols; i++) {
    const h = i < headerVals.length ? headerVals[i] : "";
    const label = h !== "" ? String(h).trim() : colName(i);
    const col = { key: colName(i), label, type: "text", width: Math.max(90, label.length * 9 + 40) };
    if (headerBg[i]) col.bg = headerBg[i];
    const fcDef = fileCols[i];
    if (fcDef && (fcDef.wpx || fcDef.wch)) {
      const px = fcDef.wpx || Math.round((fcDef.wch || 8) * 7);
      if (px > 0) {
        col.width = Math.max(24, Math.min(750, Math.round(px)));
        col.manual = true;
      }
    }
    columns.push(col);
  }

  // Merge horizontal di baris header: kolom penutup disembunyikan, kolom penjuru
  // mendapat lebar span sesuai rentang merge asli.
  const sheetMerges = Array.isArray(sheet["!merges"]) ? sheet["!merges"] : [];
  if (headerRowIdx !== null) {
    for (const m of sheetMerges) {
      if (m.s.r !== headerRowIdx || m.e.r !== headerRowIdx) continue;
      const c1 = m.s.c - offsetCol;
      const c2 = m.e.c - offsetCol;
      if (c1 < 0 || c2 >= maxCols || c2 <= c1) continue;
      columns[c1].span = c2 - c1 + 1;
      for (let i = c1 + 1; i <= c2; i++) columns[i].hidden = true;
    }
  }

  // Judul (banner): baris paling atas yang di-merge melintasi sebagian besar
  // kolom, ditampilkan sebagai pita judul berwarna di atas header.
  let banner = null;
  const wide = sheetMerges.filter(
    (m) => m.e.r < dataStart && m.e.r >= range.s.r && m.e.c - m.s.c + 1 >= Math.min(tableWidth, 260) * 0.6
  );
  if (wide.length) {
    const top = Math.min(...wide.map((m) => m.s.r));
    const winner = wide.find((m) => m.s.r === top);
    if (winner) {
      const cell = sheet[XLSX.utils.encode_cell({ r: top, c: winner.s.c })];
      const label = cell && cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : "";
      if (label !== "") banner = { label, bg: cellBgColor(cell, themes) };
    }
  }

  // Judul berwarna penuh-lebar TANPA merge (mis. pita "PETUNJUK WARNA SHEET") juga
  // ditampilkan sebagai pita judul, selama barisnya berada di ATAS area header/data
  // dan warnanya seragam di hampir seluruh lebarnya.
  if (!banner && bannerRowFlexible) {
    const topLimit = headerRowIdx !== null ? headerRowIdx : dataStart;
    const cellsAcross = Math.min(maxCols, tableWidth, 30);
    for (let rr = range.s.r; rr < topLimit; rr++) {
      const labelCell = sheet[XLSX.utils.encode_cell({ r: rr, c: offsetCol })];
      const label = labelCell && labelCell.v !== null && labelCell.v !== undefined ? String(labelCell.v).trim() : "";
      if (!label || label.length < 4) continue;
      let colored = 0;
      let common = null;
      for (let i = 0; i < cellsAcross; i++) {
        const bg = cellBgColor(sheet[XLSX.utils.encode_cell({ r: rr, c: offsetCol + i })], themes);
        if (!bg) continue;
        colored++;
        if (common === null) common = bg;
        else if (common !== bg) {
          common = null;
          break;
        }
      }
      if (colored >= Math.ceil(cellsAcross * 0.6) && common) {
        banner = { label, bg: common };
        break;
      }
    }
  }

  const offsetRow = dataStart;

  const numFmtTally = {};
  const rows = [];
  for (let r = dataStart; r <= range.e.r; r++) {
    const row = { id: `row_${sheetName}_${r - dataStart}` };
    for (let c = 0; c < maxCols; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: offsetCol + c })];
      let val = "";
      if (cell) {
        if (typeof cell.f === "string" && cell.f.trim() !== "") {
          val = "=" + rewriteFormulaRefs(cell.f.trim(), offsetCol, offsetRow, offsetForSheet);
        } else {
          val = cell.v === null || cell.v === undefined ? "" : cell.v;
        }
        const k = colName(c);
        const bg = cellBgColor(cell, themes);
        if (bg && bg !== "#ffffff") row["__" + k] = bg;
        const s = cell.s || {};
        const font = s.font;
        if (font) {
          if (font.bold) row["__b_" + k] = true;
          if (font.italic) row["__i_" + k] = true;
          const fc = pickColorFrom(font.color, themes);
          if (fc) row["__fc_" + k] = fc;
        }
        const al = s.alignment;
        if (al && (al.horizontal || al.vertical)) {
          if (al.horizontal) row["__ha_" + k] = al.horizontal;
          if (al.vertical) row["__va_" + k] = al.vertical === "center" ? "middle" : al.vertical;
        }
        const bd = cellBorder(cell);
        if (bd) row["__bd_" + k] = bd;
        if (typeof cell.v === "number") {
          const fmt = cellNumFmt(cell);
          if (fmt) {
            if (!numFmtTally[k]) numFmtTally[k] = {};
            numFmtTally[k][fmt] = (numFmtTally[k][fmt] || 0) + 1;
          }
        }
      }
      row[colName(c)] = val;
    }
    rows.push(row);
  }

  // Format angka paling dominan per kolom (mis. "#,##0.00" -> Rp, "0%" -> persen).
  for (const col of columns) {
    const tally = numFmtTally[col.key];
    if (!tally) continue;
    let bestFmt = null;
    let bestN = 0;
    for (const fmt of Object.keys(tally)) {
      if (tally[fmt] > bestN) {
        bestN = tally[fmt];
        bestFmt = fmt;
      }
    }
    if (bestFmt && /[#0.]/.test(bestFmt) && !/^@/.test(bestFmt)) col.numFmt = bestFmt;
  }

  const rowsFinal = [];
  const keptLocal = [];
  rows.forEach((row, i) => {
    if (columns.some((c) => String(row[c.key] ?? "").trim() !== "")) {
      keptLocal.push(i);
      rowsFinal.push(row);
    }
  });
  if (rowsFinal.length === 0) {
    const row = { id: `row_${sheetName}_0` };
    for (const c of columns) row[c.key] = "";
    keptLocal.push(0);
    rowsFinal.push(row);
  }
  const localOf = {};
  keptLocal.forEach((globalIdx, pos) => { localOf[globalIdx] = pos; });

  // Tinggi baris dari file asli (kolom "!rows"), dipetakan ke baris yang tersimpan.
  const fileRows = Array.isArray(sheet["!rows"]) ? sheet["!rows"] : [];
  rowsFinal.forEach((row, pos) => {
    const rd = fileRows[keptLocal[pos] + dataStart];
    if (rd && typeof rd.hpt === "number" && rd.hpt > 14) {
      row.height = Math.min(160, Math.round(rd.hpt + 4));
    }
  });

  // Pertahankan gabungan sel (merged cells) dari file asli, dipetakan ulang ke indeks
  // lokal baris/kolom grid. Hanya merge yang seluruh rentangnya masih ada yang dibawa.
  const merges = [];
  if (Array.isArray(sheet["!merges"])) {
    for (const m of sheet["!merges"]) {
      const c1 = m.s.c - offsetCol;
      const c2 = m.e.c - offsetCol;
      if (c1 < 0 || c2 >= maxCols || c2 < c1) continue;
      const rA = m.s.r - dataStart;
      const rB = m.e.r - dataStart;
      if (rA < 0 || rB < rA) continue;
      let first = null;
      let last = null;
      let ok = true;
      for (let rr = rA; rr <= rB; rr++) {
        const lp = localOf[rr];
        if (lp === undefined) { ok = false; break; }
        if (first === null) first = lp;
        last = lp;
      }
      if (!ok || first === null) continue;
      if (first === last && c1 === c2) continue;
      merges.push({ r1: first, c1, r2: last, c2 });
    }
  }

  const firstRow = opts.keepDefaultColumns
    ? dataStart + 1
    : typeof storedFirstRow === "number" && storedFirstRow >= 1
      ? storedFirstRow
      : layout.firstRow;

  const out = { name: sheetName, rows: rowsFinal, columns, firstRow };
  if (merges.length) out.merges = merges;
  if (banner) out.banner = banner;
  return out;
}

// Geser referensi kolom pada rumus (mis. "=A1+B1") saat sebuah kolom disisipkan
// di dalam sheet. Kolom dengan indeks >= shiftStart digeser sejauh shiftBy huruf;
// referensi ke sheet lain (dengan "!") tidak diubah.
function shiftColumnRefs(formula, shiftStart, shiftBy) {
  if (!formula || shiftBy === 0) return formula;
  const n = formula.length;
  let out = "";
  let i = 0;
  let skipShift = false;
  const isBoundary = (ch) => ",()+-*/^%&<>=;".includes(ch) || /\s/.test(ch);
  while (i < n) {
    const ch = formula[i];
    if (ch === "'") {
      const close = formula.indexOf("'", i + 1);
      if (close >= 0) {
        out += formula.slice(i, close + 1);
        i = close + 1;
        if (formula[i] === "!") { out += "!"; i++; skipShift = true; }
        continue;
      }
    }
    const sheetM = /^[A-Za-z_][A-Za-z0-9_.]*!/.exec(formula.slice(i));
    if (sheetM) {
      out += sheetM[0];
      i += sheetM[0].length;
      skipShift = true;
      continue;
    }
    const refM = /^\$?[A-Za-z]{1,4}\$?\d+/.exec(formula.slice(i));
    if (refM) {
      const ref = refM[0];
      const absCol = ref.startsWith("$");
      const body = absCol ? ref.slice(1) : ref;
      const atRowAbs = body.indexOf("$");
      const colStr = atRowAbs >= 0 ? body.slice(0, atRowAbs) : body.replace(/\d+$/, "");
      const rowM = /\d+$/.exec(body);
      const ci = colIndex(colStr);
      let newCol = colStr;
      if (!skipShift && ci >= shiftStart) newCol = colName(ci + shiftBy);
      let piece = (absCol ? "$" : "") + newCol;
      if (atRowAbs >= 0) piece += "$";
      piece += rowM ? rowM[0] : "";
      out += piece;
      i += ref.length;
      continue;
    }
    if (isBoundary(ch)) skipShift = false;
    out += ch;
    i++;
  }
  return out;
}

// Sisipkan `count` kolom KOSONG setelah kolom ke-`afterIndex` (0-based) di dalam sheet
// editor. Kolom yang berada di kanannya ikut digeser: key (huruf), isi baris, warna
// background ("__A"), dan referensi rumus semuanya diselaraskan ulang.
export function insertColumnIntoSheet(sheet, afterIndex, count = 1) {
  if (!sheet || count <= 0) return sheet;
  const n = sheet.columns.length;
  const pos = afterIndex + 1;
  if (pos < 0 || pos > n) return sheet;
  const oldKeys = sheet.columns.map((c) => c.key);

  const newKeys = [];
  const newCols = [];
  for (let j = 0; j < count; j++) {
    const k = colName(pos + j);
    newKeys.push(k);
    newCols.push({ key: k, label: k, type: "text", width: 100 });
  }

  const keyMap = {};
  for (let i = pos; i < n; i++) keyMap[oldKeys[i]] = colName(i + count);

  const newRows = sheet.rows.map((row) => {
    const nr = {};
    for (const k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (k === "id") { nr[k] = row[k]; continue; }
      if (k.startsWith("__")) {
        const base = k.slice(2);
        const mapped = keyMap[base];
        nr["__" + (mapped || base)] = row[k];
        continue;
      }
      let val = row[k];
      if (typeof val === "string" && val.startsWith("=")) {
        val = shiftColumnRefs(val, pos, count);
      }
      const mapped = keyMap[k];
      nr[mapped || k] = val;
    }
    for (const k of newKeys) if (!(k in nr)) nr[k] = "";
    return nr;
  });

  const newColsArr = [];
  for (let i = 0; i < pos; i++) newColsArr.push(sheet.columns[i]);
  newColsArr.push(...newCols);
  for (let i = pos; i < n; i++) newColsArr.push({ ...sheet.columns[i], key: colName(i + count) });

  let merges = Array.isArray(sheet.merges) ? sheet.merges : [];
  if (merges.length) {
    merges = merges
      .map((m) => (m.c1 >= pos ? { ...m, c1: m.c1 + count, c2: m.c2 + count } : m))
      .filter((m) => m.c2 >= m.c1 && m.c2 < newColsArr.length);
  }
  const out = { ...sheet, columns: newColsArr, rows: newRows };
  if (merges.length) out.merges = merges;
  return out;
}

// Sisipkan `count` baris kosong mulai dari indeks `atRow` (0-based). Baris yang berada
// di bawahnya ikut bergeser: nilai/rumus dipertahankan, referensi baris pada rumus
// yang menunjuk ke baris >= atRow ikut digeser (relatif saja), merge ikut digeser.
export function insertRowIntoSheet(sheet, atRow, count = 1) {
  if (!sheet || !Array.isArray(sheet.rows) || count <= 0) return sheet;
  const total = sheet.rows.length;
  if (total === 0) return sheet;
  const pos = Math.max(0, Math.min(total, atRow));
  const newRows = [];
  for (let i = 0; i < count; i++) {
    const nr = { id: `row_${Date.now()}_${i}` };
    for (const c of sheet.columns) nr[c.key] = "";
    newRows.push(nr);
  }

  const shiftedRows = [];
  let inserted = false;
  for (let i = 0; i < sheet.rows.length; i++) {
    if (i === pos) {
      shiftedRows.push(...newRows);
      inserted = true;
    }
    const src = sheet.rows[i];
    let next = src;
    for (const k of Object.keys(src)) {
      if (k === "id" || k.startsWith("__")) continue;
      const v = src[k];
      if (typeof v === "string" && v.startsWith("=")) {
        const nv = shiftFormulaRefsRowInsert(v, pos, count);
        if (nv !== v) {
          if (next === src) next = { ...src };
          next[k] = nv;
        }
      }
    }
    shiftedRows.push(next);
  }
  if (!inserted) shiftedRows.push(...newRows);

  let merges = Array.isArray(sheet.merges) ? sheet.merges : [];
  if (merges.length) {
    merges = merges
      .map((m) => {
        if (m.r2 < pos) return m;
        if (m.r1 >= pos) return { ...m, r1: m.r1 + count, r2: m.r2 + count };
        return { ...m, r2: m.r2 + count };
      })
      .filter((m) => m.r2 >= m.r1);
  }
  const out = { ...sheet, rows: shiftedRows };
  if (merges.length) out.merges = merges;
  return out;
}

// Hapus baris r1..r2 (0-based). Merge yang sepenuhnya dihapus dibuang; merge yang
// melintasi batas dipertahankan separuh yang tersisa; merge di bawahnya digeser.
export function deleteRowsFromSheet(sheet, r1, r2) {
  if (!sheet || !Array.isArray(sheet.rows)) return sheet;
  const d1 = Math.max(0, r1);
  const d2 = Math.min(sheet.rows.length - 1, r2);
  if (d1 > d2) return sheet;
  const count = d2 - d1 + 1;
  let rows = sheet.rows.filter((_, i) => i < d1 || i > d2);
  if (rows.length === 0) {
    const nr = { id: `row_${Date.now()}` };
    for (const c of sheet.columns) nr[c.key] = "";
    rows = [nr];
  }
  let merges = Array.isArray(sheet.merges) ? sheet.merges : [];
  if (merges.length) {
    const next = [];
    for (const m of merges) {
      if (m.r2 < d1) { next.push(m); continue; }
      if (m.r1 > d2) { next.push({ ...m, r1: m.r1 - count, r2: m.r2 - count }); continue; }
      if (m.r1 >= d1 && m.r2 <= d2) continue;
      if (m.r1 < d1) next.push({ ...m, r2: d1 - 1 });
      if (m.r2 > d2) next.push({ ...m, r1: Math.max(m.r1, d2 + 1) - count, r2: m.r2 - count });
    }
    merges = next.filter((m) => m.r2 >= m.r1);
  }
  const out = { ...sheet, rows };
  if (merges && merges.length) out.merges = merges;
  else delete out.merges;
  return out;
}

// Hapus kolom c1..c2 (0-based berdasarkan urutan columns). Data, warna, gaya, dan
// merge pada kolom yang dihapus dibuang; merge/kolom kanannya digeser ke kiri.
export function deleteColumnsFromSheet(sheet, c1, c2) {
  if (!sheet || !Array.isArray(sheet.columns)) return sheet;
  const n = sheet.columns.length;
  if (n <= 1) return sheet;
  const d1 = Math.max(0, Math.min(n - 1, c1));
  const d2 = Math.max(0, Math.min(n - 1, c2));
  if (d1 > d2) return sheet;
  const count = d2 - d1 + 1;
  const removedKeys = sheet.columns.slice(d1, d2 + 1).map((c) => c.key);
  const newColumns = sheet.columns.filter((_, i) => i < d1 || i > d2);
  const newRows = sheet.rows.map((row) => {
    const nr = { ...row };
    for (const k of removedKeys) {
      delete nr[k];
      delete nr["__" + k];
      delete nr["__b_" + k];
      delete nr["__i_" + k];
      delete nr["__fc_" + k];
      delete nr["__ha_" + k];
      delete nr["__va_" + k];
      delete nr["__bd_" + k];
    }
    return nr;
  });
  let merges = Array.isArray(sheet.merges) ? sheet.merges : [];
  if (merges.length) {
    const fixed = [];
    for (const m of merges) {
      if (m.c2 < d1) { fixed.push(m); continue; }
      if (m.c1 > d2) { fixed.push({ ...m, c1: m.c1 - count, c2: m.c2 - count }); continue; }
      if (m.c1 >= d1 && m.c2 <= d2) continue;
      if (m.c1 < d1) fixed.push({ ...m, c2: d1 - 1 });
      if (m.c2 > d2) fixed.push({ ...m, c1: Math.max(m.c1, d2 + 1) - count, c2: m.c2 - count });
    }
    merges = fixed.filter((m) => m.c2 >= m.c1 && m.c2 < newColumns.length);
  }
  const out = { ...sheet, columns: newColumns, rows: newRows };
  if (merges && merges.length) out.merges = merges;
  else delete out.merges;
  return out;
}

// Ubah warna tema/indeks di cell.s menjadi RGB eksplisit supaya tidak hilang
// saat workbook ditulis ulang via XLSX.write → round-trip storage/refresh.
export function bakeThemeColors(wb) {
  if (!wb || !wb.Sheets) return wb;
  const themes = wb.themes && wb.themes.themeElements ? wb.themes : null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    for (const addr of Object.keys(ws)) {
      if (addr.charCodeAt(0) === 33) continue; // skip "!ref", "!cols" etc
      const cell = ws[addr];
      if (!cell || !cell.s) continue;
      const s = cell.s;
      // Beberapa versi xlsx-js-style menempatkan properti fill langsung di cell.s
      // (bukan di cell.s.fill) — tangani kedua bentuk seperti cellBgColor.
      const srcFill = s.fill && typeof s.fill === "object" ? s.fill : s;
      const fg = pickColorFrom(srcFill.fgColor, themes);
      const bg = pickColorFrom(srcFill.bgColor, themes);
      if ((srcFill.patternType || fg) && fg) {
        const out = { patternType: srcFill.patternType || "solid" };
        out.fgColor = { rgb: fg.replace("#", "").toUpperCase() };
        if (bg) out.bgColor = { rgb: bg.replace("#", "").toUpperCase() };
        s.fill = out;
      }
      if (s.font && s.font.color) {
        const fc = pickColorFrom(s.font.color, themes);
        if (fc) s.font.color = { rgb: fc.replace("#", "").toUpperCase() };
      }
    }
  }
  return wb;
}

// =====================================================================
// Debug ke-faithful-an import (diminta user): bandingkan workbook ASLI
// cell-per-cell berdasarkan ALAMAT (A1..) dengan grid yang dihasilkan
// importSheetNative — tanpa menebak, tanpa menyembunyikan perbedaan.
// Hasilnya dipakai editor untuk menampilkan status "1:1" atau daftar sel.
// =====================================================================
export function debugImportFidelity(wb, opts = {}) {
  const report = { differences: 0, checked: 0, sheets: [] };
  if (!wb || !Array.isArray(wb.SheetNames)) return report;
  const themes = wb.themes && wb.themes.themeElements ? wb.themes : null;
  // default: grid yang SAMA dengan yang dipakai aplikasi. Bisa dioverride
  // (mis. mesin lama berbasis densitas) untuk membuktikan alat ini mampu
  // mendeteksi pergeseran — bukan tautologi.
  const build = opts.builder || ((n, wEl) => importSheetNative(n, wEl, themes));

  const vKey = (cell) => {
    if (typeof cell.f === "string" && cell.f.trim() !== "") return "=" + cell.f.trim();
    const v = cell.v;
    if (v === null || v === undefined) return "";
    return v instanceof Date ? v.getTime() : v;
  };
  const same = (a, b) => {
    if (a instanceof Date) a = a.getTime();
    if (b instanceof Date) b = b.getTime();
    if (a === b) return true;
    if ((a === "" || a === null || a === undefined) && (b === "" || b === null || b === undefined)) return true;
    if (typeof a === "number" && typeof b === "number") return a === b;
    return String(a) === String(b);
  };

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const sh = build(name, ws);
    const fileCols = Array.isArray(ws["!cols"]) ? ws["!cols"] : [];
    const fileRows = Array.isArray(ws["!rows"]) ? ws["!rows"] : [];
    const fileMerges = Array.isArray(ws["!merges"]) ? ws["!merges"] : [];
    let checked = 0;
    let valueDiff = 0;
    let nfDiff = 0;
    let styleDiff = 0;
    let dimDiff = 0;
    let sample = [];
    let lastC = -1;
    let lastR = -1;

    // Lebar kolom & tinggi baris file vs grid (hanya yang DEKLARASIKAN file,
    // agar baris yang pakai tinggi default bukan kena hitung beda).
    const excelColPx = (fc) => {
      if (!fc) return null;
      const wpx = typeof fc.wpx === "number" && fc.wpx > 0 ? fc.wpx : typeof fc.wch === "number" && fc.wch > 0 ? Math.round(fc.wch * 7 + 5) : 0;
      return wpx > 0 ? wpx : null;
    };
    fileCols.forEach((fc, i) => {
      const ex = excelColPx(fc);
      if (ex == null) return;
      const web = sh.columns[i] && sh.columns[i].width;
      if (web == null || Math.abs(ex - web) > 2) {
        dimDiff++;
        if (sample.length < 12) sample.push({ addr: "Col " + colName(i), excel: ex + "px", web: web == null ? "(hilang)" : web + "px", category: "width" });
      }
    });
    fileRows.forEach((fr, i) => {
      if (!fr || typeof fr.hpt !== "number" || fr.hpt <= 0) return;
      const ex = Math.round((fr.hpt * 96) / 72);
      const rw = sh.rows[i];
      const web = rw && rw.height;
      if (web == null || Math.abs(ex - web) > 2) {
        dimDiff++;
        if (sample.length < 12) sample.push({ addr: "Row " + (i + 1), excel: ex + "px", web: web == null ? "(hilang)" : web + "px", category: "height" });
      }
    });

    const normBg = (hex) => {
      if (!hex) return "";
      let h = String(hex).replace("#", "").toUpperCase();
      if (h.length === 8) h = h.slice(2);
      return h.length === 6 ? "#" + h : h;
    };
    const styleOf = (row, colKey, cell) => {
      const s = cell && cell.s ? cell.s : null;
      const out = {};
      const bgR = row["__" + colKey];
      const bgS = s && s.fill && s.fill.fgColor ? normBg(s.fill.fgColor.rgb) : "";
      if ((bgR && bgR !== "#ffffff") || bgS) {
        const expected = bgS;
        const got = bgR || "";
        if (got.toLowerCase() !== expected.toLowerCase()) out.fill = `${expected} vs ${got}`;
      }
      const f = s && s.font ? s.font : null;
      if (!!f && !!f.bold !== !!row["__b_" + colKey]) out.bold = true;
      if (!!f && !!f.italic !== !!row["__i_" + colKey]) out.italic = true;
      if (f && !!f.underline !== !!row["__u_" + colKey]) out.underline = true;
      if (f && f.sz && row["__sz_" + colKey] && f.sz !== row["__sz_" + colKey]) out.size = `${f.sz} vs ${row["__sz_" + colKey]}`;
      const ha = s && s.alignment && s.alignment.horizontal;
      if (ha && ha !== (row["__ha_" + colKey] || "")) out.align = `${ha} vs ${row["__ha_" + colKey] || "-"}`;
      const sides = ["t", "b", "l", "r"];
      const keyM = { t: "top", r: "right", b: "bottom", l: "left" };
      const w2s = (w) => (w >= 3 ? "thick" : w >= 2 ? "medium" : "thin");
      const bdW = row["__bd_" + colKey];
      for (const sd of sides) {
        const fb = s && s.border ? s.border[sd] || s.border[keyM[sd]] : null;
        const es = fb && fb.style && fb.style !== "none" ? fb.style : null;
        const bw = bdW && bdW[sd];
        const gs = bw && bw.w ? w2s(bw.w) : null;
        if ((es || gs) && es !== gs) out["border" + sd] = `${es || "-"} vs ${gs || "-"}`;
      }
      return Object.keys(out).length ? out : null;
    };
    const keys = Object.keys(ws);
    for (const key of keys) {
      if (!/^[A-Z]{1,3}\d+$/.test(key)) continue;
      const cell = ws[key];
      if (!cell) continue;
      const addr = XLSX.utils.decode_cell(key);
      if (addr.r > lastR) lastR = addr.r;
      if (addr.c > lastC) lastC = addr.c;
      const row = sh.rows[addr.r];
      const colKey = colName(addr.c);
      const got = row ? row[colKey] : undefined;
      const src = vKey(cell);
      checked++;
      if (!same(src, got)) {
        valueDiff++;
        if (sample.length < 12) sample.push({ addr: key, excel: src, web: got });
      }
      const nf = cellNumFmt(cell);
      if (nf) {
        const gotNf = row ? row["__nf_" + colKey] || "" : "";
        if (gotNf !== nf) {
          nfDiff++;
          if (sample.length < 12) sample.push({ addr: key, excel: src, web: got, excelNf: nf, webNf: gotNf });
        }
      }
      if (cell.s) {
        const diff = styleOf(row || {}, colKey, cell);
        if (diff) {
          styleDiff++;
          if (sample.length < 12) sample.push({ addr: key, excel: src, web: got, styleDiff: JSON.stringify(diff) });
        }
      }
    }
    // Merge & bentang grid: jumlah merge harus SAMA; grid tidak boleh lebih
    // kecil dari isi sungguhan.
    let mergeDiff = fileMerges.length - (sh.merges ? sh.merges.length : 0);
    if (mergeDiff < 0) mergeDiff = -mergeDiff;
    let extentNote = "";
    if (sh.columns.length < lastC + 1) extentNote = `kolom grid ${sh.columns.length} < file ${lastC + 1}`;
    else if (sh.rows.length < lastR + 1) extentNote = `baris grid ${sh.rows.length} < file ${lastR + 1}`;
    const sheetDiffs = valueDiff + nfDiff + mergeDiff + styleDiff + dimDiff + (extentNote ? 1 : 0);
    report.differences += sheetDiffs;
    report.checked += checked;
    report.sheets.push({
      name,
      columns: sh.columns.length,
      rows: sh.rows.length,
      fileExtent: { cols: lastC + 1, rows: lastR + 1 },
      checked,
      valueDiff,
      nfDiff,
      mergeDiff,
      styleDiff,
      dimDiff,
      extentNote: extentNote || "",
      sample,
    });
  }
  return report;
}

// Hanya sheet 0 → dipakai initializer state agar paint pertama langsung berisi
// data tanpa menunggu konversi/serialisasi seluruh workbook (sisa sheet diisi
// bertahap oleh workbookToSheetsProgressive).
export function firstSheetFromWorkbook(wb, opts = {}) {
  const ctx = prepareWorkbookCtx(wb, opts);
  if (!ctx) return createEmptySheet("Sheet1");
  return buildSheetFromCtx(ctx, ctx.sheetNames[0]);
}

export function workbookToSheets(wb, opts = {}) {
  const ctx = prepareWorkbookCtx(wb, opts);
  if (!ctx) return [createEmptySheet("Sheet1")];
  return ctx.sheetNames.map((name) => buildSheetFromCtx(ctx, name));
}

// Siapkan konteks impor sekali (nama sheet, offset layout, tema). Dipanggil oleh
// workbookToSheets (sinkron) dan workbookToSheetsProgressive (bertahap).
function prepareWorkbookCtx(wb, opts = {}) {
  if (!wb || !Array.isArray(wb.SheetNames) || wb.SheetNames.length === 0) return null;
  const allNative = opts.native === true;
  let nativeList = [];
  const storedNative = wb.Custprops && wb.Custprops[NATIVE_KEY];
  if (storedNative) {
    try {
      const parsed = JSON.parse(storedNative);
      if (Array.isArray(parsed)) nativeList = parsed.map((x) => String(x));
    } catch (_) {
      /* abaikan marker rusak */
    }
  }
  const isNative = (name) => allNative || nativeList.includes(name);
  const offsetMap = {};
  const stored = wb.Custprops && wb.Custprops[OFFSET_KEY];
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      for (const k in parsed) {
        if (Number.isFinite(parsed[k]) && parsed[k] >= 1) offsetMap[k] = parsed[k];
      }
    } catch (_) {
      /* abaikan offset lama yang rusak */
    }
  }
  const offsets = {};
  for (const name of wb.SheetNames) {
    const lay = detectSheetLayout(wb.Sheets[name]);
    offsets[name] = { offsetCol: lay.offsetCol, offsetRow: lay.dataStart };
  }
  const offsetForSheet = (nm) => offsets[nm.toLowerCase()] || null;
  const themes = wb.themes && wb.themes.themeElements ? wb.themes : null;
  return { wb, opts, isNative, offsetMap, offsets, offsetForSheet, themes, sheetNames: wb.SheetNames };
}

// Bangun SATU sheet dari konteks import (dipakai progresif: sheet aktif dulu,
// sisanya menyusul di waktu idle — UI tidak membeku saat buka file besar).
function buildSheetFromCtx(ctx, name) {
  const { wb, opts, isNative, offsetForSheet, themes } = ctx;
  let sh = null;
  if (isNative(name)) {
    sh = importSheetNative(name, wb.Sheets[name], themes);
    // Gambar/bentuk dari file asli (diekstrak saat impor) dipasang ke sheet
    // agar dirender pada posisi sel/baris/kolom yang sama dengan Excel.
    if (sh && wb.__images && Array.isArray(wb.__images[name])) {
      sh.images = wb.__images[name];
    }
  }
  if (!sh) sh = importSheetFromXLSX(name, wb.Sheets[name], offsetForSheet, ctx.offsetMap[name], themes, opts);
  if (sheetLooksEmpty(sh)) {
    const ws = wb.Sheets[name];
    // Sheet impor yang kosong namun file mendeklarasikan struktur pembentuk
    // layout (rentang !ref / definisi lebar kolom) dipertahankan apa adanya,
    // bukan diganti grid template — baris/kolom kosong itu bagian dari layout
    // Excel asli (mis. Home: 1000 baris, 26 kolom, semua 61px).
    const hasLayout =
      ws &&
      (typeof ws["!ref"] === "string" ||
        (Array.isArray(ws["!cols"]) && ws["!cols"].some((c) => c && (typeof c.wch === "number" || typeof c.wpx === "number"))));
    if (!(isNative(name) && hasLayout)) return createEmptySheet(sh && sh.name ? sh.name : name);
  }
  return sh;
}

// Konversi workbook → sheets SECARA BERTAHAP (time-slicing + requestIdleCallback).
// Sheet pertama dibangun sinkron agar tampil secepat mungkin; sisanya disusulkan
// ke onBatch sebagai array kumulatif (append-only, indeks stabil). onDone dipanggil
// setelah semua selesai. Mengembalikan fungsi pembatalan bila sesi dibatalkan.
export function workbookToSheetsProgressive(wb, opts = {}, onBatch, onDone) {
  const ctx = prepareWorkbookCtx(wb, opts);
  if (!ctx) {
    const empty = [createEmptySheet("Sheet1")];
    onBatch(empty);
    if (onDone) onDone();
    return () => {};
  }
  let acc = [];
  let i = 0;
  let cancelled = false;
  const TIME_SLICE_MS = 12;
  // Bangun SATU sheet dengan aman: bila satu sheet gagal dikonversi, jangan
  // sampai menghentikan seluruh workbook — pakai sheet kosong sebagai gantinya
  // agar sheet berikutnya tetap dibangun (index stabil).
  const buildOneSafely = (name) => {
    try {
      return buildSheetFromCtx(ctx, name);
    } catch (err) {
      try {
        console.warn("[workbookToSheetsProgressive] gagal membangun sheet:", name, err && err.message);
      } catch (_) { /* abaikan */ }
      return createEmptySheet(name);
    }
  };
  const runSlice = () => {
    if (cancelled) return;
    const t0 = typeof performance === "undefined" ? Date.now() : performance.now();
    while (i < ctx.sheetNames.length) {
      acc.push(buildOneSafely(ctx.sheetNames[i]));
      i++;
      const now = typeof performance === "undefined" ? Date.now() : performance.now();
      if (now - t0 > TIME_SLICE_MS) break;
    }
    if (onBatch) onBatch(acc.slice());
    if (i < ctx.sheetNames.length) {
      scheduleNext();
    } else if (onDone) {
      onDone();
    }
  };
  const scheduleNext = () => {
    const cb = () => runSlice();
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(cb, { timeout: 400 });
    } else {
      setTimeout(cb, 2);
    }
  };
  // Mulai segera setelah microtask (biar UI sempat menampilkan state "memuat").
  Promise.resolve().then(runSlice);
  return () => {
    cancelled = true;
  };
}

// Terapkan bingkai (border) pada rentang sel di sebuah sheet.
// sides: "none" (hapus semua), atau array dari "all" / "outline" / "inner" /
// "t" / "b" / "l" / "r". weight: 1=tipis, 2=sedang, 3=tebal (px). Daerah merge
// hanya diberi bingkai bila seluruh bloknya berada dalam rentang pilihan, dan
// bingkai ditempelkan pada sel sudut sehingga tampilan persis seperti Excel.
export function applyBordersToSheet(sheet, range, sides, weight) {
  if (!sheet || !sheet.columns || !sheet.columns.length || !range) return sheet;
  const cols = sheet.columns;
  const merges = Array.isArray(sheet.merges) ? sheet.merges : [];
  const { r1, r2, c1 } = range;
  const c2 = Math.min(range.c2, cols.length - 1);
  if (r1 == null || r2 == null || c1 == null || r1 > r2 || c1 > c2) return sheet;

  const sideSet = Array.isArray(sides) && sides.length ? sides : ["all"];
  const cleared = sideSet.join(",") === "none";
  const val = cleared ? null : { w: Math.max(1, Math.min(3, Math.round(Number(weight) || 1))), c: "#000000" };

  const occ = (r, c) => {
    for (const m of merges) {
      if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m;
    }
    return null;
  };

  const rowsOut = [];
  for (let ri = 0; ri < sheet.rows.length; ri++) {
    const row = sheet.rows[ri];
    if (ri < r1 || ri > r2) {
      rowsOut.push(row);
      continue;
    }
    const nr = { ...row };
    for (let ci = c1; ci <= c2; ci++) {
      const k = cols[ci]?.key;
      if (!k) continue;
      const m = occ(ri, ci);
      // Sel lanjutan daerah merge (bukan sudut): tidak disentuh.
      if (m && (m.r1 !== ri || m.c1 !== ci)) continue;
      const reg = m || { r1: ri, r2: ri, c1: ci, c2: ci };
      // Blok merge harus SELURUHNYA di dalam rentang pilihan, barulah diberi bingkai.
      if (reg.r1 < r1 || reg.r2 > r2 || reg.c1 < c1 || reg.c2 > c2) continue;
      const edge = { t: reg.r1 === r1, b: reg.r2 === r2, l: reg.c1 === c1, r: reg.c2 === c2 };
      const want = (s) => {
        if (cleared) return false;
        if (sideSet.includes("all")) return true;
        if (sideSet.includes("outline")) return edge[s];
        if (sideSet.includes("inner")) return !edge[s];
        if (sideSet.includes(s)) return true;
        return false;
      };
      for (const s of ["t", "r", "b", "l"]) {
        if (cleared) {
          const bd = nr["__bd_" + k];
          if (bd && s in bd) {
            const nb = { ...bd };
            delete nb[s];
            if (Object.keys(nb).length) nr["__bd_" + k] = nb;
            else delete nr["__bd_" + k];
          }
          continue;
        }
        if (!want(s)) continue;
        const bd = nr["__bd_" + k] ? { ...nr["__bd_" + k] } : {};
        bd[s] = val;
        nr["__bd_" + k] = bd;
      }
    }
    rowsOut.push(nr);
  }
  return { ...sheet, rows: rowsOut };
}

export function sheetsToWorkbook(sheets) {
  const wb = XLSX.utils.book_new();
  const rowOffsets = {};
  const nativeSheets = [];
  for (const sheet of sheets) {
    const cols = sheet.columns;

    // ===== Sheet native (impor faithful 1:1): tulis balik apa adanya. =====
    if (sheet.native) {
      nativeSheets.push(sheet.name);
      const data = sheet.rows.map((row) =>
        cols.map((c) => {
          const v = row[c.key];
          return v === null || v === undefined ? "" : v;
        })
      );
      const ws = data.length ? XLSX.utils.aoa_to_sheet(data) : XLSX.utils.aoa_to_sheet([[]]);
      sheet.rows.forEach((row, r) => {
        if (!row) return;
        for (let ci = 0; ci < cols.length; ci++) {
          const c = cols[ci];
          const a = XLSX.utils.encode_cell({ r, c: ci });
          const v = row[c.key];
          // Sel ber-rumus ditulis sebagai RUMUS sungguhan ("=SUM(...)" -> f:"SUM(...)")
          // beserta nilai cached hasil Excel (v) bila ada — angka persis file asli
          // tidak hilang saat file disimpan/dibuka kembali; rumus tetap utuh.
          const isF = typeof v === "string" && v.startsWith("=");
          const cell = isF ? { f: v.slice(1).trim() } : ws[a];
          if (!cell) continue;
          const style = applyNativeExportStyle(row, c);
          if (Object.keys(style).length) cell.s = style;
          if (isF) {
            const cv = row["__cv_" + c.key];
            if (cv !== undefined && cv !== "" && !(typeof cv === "string" && cv.startsWith("#"))) cell.v = cv;
            ws[a] = cell;
          }
        }
      });
      if (Array.isArray(sheet.merges) && sheet.merges.length) {
        ws["!merges"] = sheet.merges.map((m) => ({
          s: { r: m.r1, c: m.c1 },
          e: { r: m.r2, c: m.c2 },
        }));
      }
      const colW = cols.map((c) => {
        const base = c.width && c.width > 0 ? c.width : 64;
        const w = { wch: Math.max(3, Math.ceil((base - 6) / 7)) };
        if (c.hidden) w.hidden = true;
        return w;
      });
      if (colW.length) ws["!cols"] = colW;
      const rowHArr = new Array(sheet.rows.length);
      sheet.rows.forEach((row, r) => {
        if (!row) return;
        const entry = {};
        if (row.height && row.height > 0) {
          entry.hpt = Math.max(3, Math.round(((row.height * 72) / 96) * 10) / 10);
        }
        if (row.hidden) entry.hidden = true;
        if (entry.hpt !== undefined || entry.hidden) rowHArr[r] = entry;
      });
      if (rowHArr.some(Boolean)) ws["!rows"] = rowHArr;
      if (sheet.freeze && typeof sheet.freeze.xSplit === "number" && typeof sheet.freeze.ySplit === "number") {
        ws["!freeze"] = { ...sheet.freeze };
      }
      rowOffsets[sheet.name] = 1;
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
      continue;
    }

    const hasBanner = !!(sheet.banner && String(sheet.banner.label ?? "").trim() !== "");
    const bannerRow = hasBanner ? cols.map(() => "") : null;
    const headerRow = cols.map((c, i) => (c.hidden ? "" : c.label || colName(i)));
    const data = [];
    if (bannerRow) {
      data.push(bannerRow.map((_, i) => (i === 0 ? String(sheet.banner.label).trim() : bannerRow[i])));
    }
    data.push(headerRow);
    const validRowIndices = [];
    sheet.rows.forEach((row, ri) => {
      if (cols.some((c) => row[c.key] !== "" && row[c.key] !== null && row[c.key] !== undefined)) {
        data.push(cols.map((c) => row[c.key] ?? ""));
        validRowIndices.push(ri);
      }
    });
    const headerGlobal = hasBanner ? 1 : 0;
    const ws = validRowIndices.length === 0 ? XLSX.utils.aoa_to_sheet([[]]) : XLSX.utils.aoa_to_sheet(data);
const idxOf = {};
  validRowIndices.forEach((ri, di) => { idxOf[ri] = di + headerGlobal + 1; });
  validRowIndices.forEach((origRowIdx, di) => {
    const row = sheet.rows[origRowIdx];
    for (let ci = 0; ci < cols.length; ci++) {
      const c = cols[ci];
      const a = XLSX.utils.encode_cell({ r: idxOf[origRowIdx], c: ci });
      const raw2 = row[c.key];
      const is2 = typeof raw2 === "string" && raw2.startsWith("=");
      const cell = is2 ? { f: raw2.slice(1).trim() } : ws[a];
      if (!cell) continue;
      const style = {};
      const bg = row["__" + c.key];
      if (bg && bg !== "#ffffff") {
        style.fill = { patternType: "solid", fgColor: { rgb: bg.replace("#", "").toUpperCase() } };
      }
      const bold = row["__b_" + c.key];
      const italic = row["__i_" + c.key];
      const fc = row["__fc_" + c.key];
      if (bold || italic || fc) {
        const font = {};
        if (bold) font.bold = true;
        if (italic) font.italic = true;
        if (fc) font.color = { rgb: fc.replace("#", "").toUpperCase() };
        style.font = font;
      }
      const ha = row["__ha_" + c.key];
      const va = row["__va_" + c.key];
      if (ha || va) {
        style.alignment = {
          ...(ha ? { horizontal: ha } : {}),
          ...(va ? { vertical: va === "middle" ? "center" : va } : {}),
        };
      }
      const brd = row["__bd_" + c.key];
      if (brd && typeof brd === "object") {
        const border = {};
        const fileKey = { t: "top", r: "right", b: "bottom", l: "left" };
        for (const k of ["t", "r", "b", "l"]) {
          const s = brd[k];
          if (!s) continue;
          border[fileKey[k]] = {
            style: s.w >= 3 ? "thick" : s.w >= 2 ? "medium" : "thin",
            color: { rgb: (s.c || "#000000").replace("#", "").toUpperCase() },
          };
        }
        if (Object.keys(border).length) style.border = border;
      }
      if (typeof c.numFmt === "string" && typeof cell.v === "number") {
        style.numFmt = c.numFmt;
      }
      if (Object.keys(style).length) cell.s = style;
      if (is2) {
        const cv = row["__cv_" + c.key];
        if (cv !== undefined && cv !== "" && !(typeof cv === "string" && cv.startsWith("#"))) cell.v = cv;
        ws[a] = cell;
      }
    }
  });
    const saveMerges = [];
    if (hasBanner) {
      const a = XLSX.utils.encode_cell({ r: 0, c: 0 });
      if (ws[a]) {
        ws[a].s = {
          ...(ws[a].s || {}),
          fill: { patternType: "solid", fgColor: { rgb: (sheet.banner.bg || "#FFFFFF").replace("#", "").toUpperCase() } },
        };
      }
      saveMerges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } });
    }
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const bg = col.bg;
      if (bg) {
        const a = XLSX.utils.encode_cell({ r: headerGlobal, c: ci });
        const cell = ws[a];
        if (cell) {
          cell.s = {
            ...(cell.s || {}),
            fill: { patternType: "solid", fgColor: { rgb: bg.replace("#", "").toUpperCase() } },
          };
        }
      }
      if (col.span && col.span > 1) {
        saveMerges.push({ s: { r: headerGlobal, c: ci }, e: { r: headerGlobal, c: ci + col.span - 1 } });
      }
    }
    if (Array.isArray(sheet.merges) && sheet.merges.length && validRowIndices.length) {
      const ms = [];
      for (const m of sheet.merges) {
        if (idxOf[m.r1] === undefined || idxOf[m.r2] === undefined) continue;
        if (idxOf[m.r1] > idxOf[m.r2]) continue;
        ms.push({ s: { r: idxOf[m.r1], c: m.c1 }, e: { r: idxOf[m.r2], c: m.c2 } });
      }
      saveMerges.push(...ms);
    }
    saveMerges.sort((x, y) => (x.s.r - y.s.r) || (x.s.c - y.s.c));
    if (saveMerges.length) ws["!merges"] = saveMerges;
    const colW = cols.map((c) => {
      let wch = Math.max(3, Math.ceil(((c.width && c.width > 0 ? c.width : 100) - 6) / 7));
      if (c.label && String(c.label).length > wch) wch = Math.max(wch, 10);
      return { wch };
    });
    if (colW.length) ws["!cols"] = colW;
    const totalRows = headerGlobal + validRowIndices.length + 1;
    const rowHArr = new Array(totalRows);
    validRowIndices.forEach((origRowIdx, di) => {
      const h = sheet.rows[origRowIdx].height;
      if (h && h > 0) rowHArr[headerGlobal + di] = { hpt: Math.max(9, Math.round(h) - 4) };
    });
    if (rowHArr.some(Boolean)) ws["!rows"] = rowHArr;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    const fr = typeof sheet.firstRow === "number" && sheet.firstRow >= 1 ? sheet.firstRow : 1;
    rowOffsets[sheet.name] = fr;
  }
  const cp = wb.Custprops && typeof wb.Custprops === "object" ? wb.Custprops : {};
  cp[OFFSET_KEY] = JSON.stringify(rowOffsets);
  if (nativeSheets.length) cp[NATIVE_KEY] = JSON.stringify(nativeSheets);
  wb.Custprops = cp;
  // Gambar/bentuk per sheet ikut melekat pada workbook agar posisi/teks hasil
  // edit (drag/pindah/ubah tulisan) ikut tersimpan saat saveFile → reload.
  let anyImages = false;
  for (const sheet of sheets) {
    if (Array.isArray(sheet.images) && sheet.images.length) {
      if (!wb.__images) wb.__images = {};
      wb.__images[sheet.name] = sheet.images;
      anyImages = true;
    }
  }
  if (!anyImages && wb.__images) {
    // sheet tanpa gambar — tetap bawa map kosong agar saveFile konsisten
    wb.__images = wb.__images || {};
  }
  return wb;
}