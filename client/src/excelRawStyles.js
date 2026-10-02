import { openFileZip } from "./excelImages.js";

// Pembaca STYLE mentah dari zip .xlsx (styles.xml + theme1.xml + worksheet XML).
//
// LATAR BELAKANG: xlsx-js-style HANYA mempertahankan "fill" saat MEMBACA file
// (font, alignment, dan BORDER dibuang dari cell.s). Akibatnya border tebal/tipis,
// font bold/ukuran, dan perataan tidak pernah ikut terimpor dari file Excel.
// Modul ini membaca langsung katalog style file:
//   - xl/styles.xml    -> numFmts, fonts, fills, borders, cellXfs (xf per sel)
//   - xl/theme/theme1.xml -> tema warna (srgbClr/sysClr) agar <color theme=..>
//     dan tint dapat dimasak ke hex ARGB asli
//   - xl/worksheets/sheetN.xml -> atribut s=.. (index xf) pada tiap <c>
// lalu menyuntikkan style lengkap (+numFmt) ke `cell.s` objek workbook SheetJS.
// Hasil akhir OPOSISI "Excel asli -> import" jadi: nilai, formula, merge,

const BUILTIN_NUMFMTS = {
  0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00",
  9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 13: "# ??/??",
  14: "m/d/yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
  18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss",
  22: "m/d/yy h:mm", 37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
};

const INDEXED_COLORS = [
  "#FF0000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF",
  "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF",
  "#800000", "#008000", "#000080", "#808000", "#800080", "#008080", "#C0C0C0", "#808080",
  "#9999FF", "#993366", "#FFFFCC", "#CCFFFF", "#660066", "#FF8080", "#0066CC", "#CCCCFF",
  "#000080", "#FF00FF", "#FFFF00", "#00FFFF", "#800080", "#800000", "#008080", "#0000FF",
  "#00CCFF", "#CCFFFF", "#CCFFCC", "#FFFF99", "#99CCFF", "#FF99CC", "#CC99FF", "#FFCC99",
  "#3366FF", "#33CCCC", "#99CC00", "#FFCC00", "#FF9900", "#FF6600", "#666699", "#969696",
  "#003366", "#339966", "#003300", "#333300", "#993300", "#993366", "#333399", "#333333",
];

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function attrVal(src, name) {
  const m = new RegExp("\\b" + name + '="([^"]*)"').exec(src);
  return m ? m[1] : null;
}

function childBlocks(xml, tag) {
  const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function applyTint(rgb, tint) {
  if (!tint) return rgb;
  const lum = tint < 0 ? 1 + tint : 1 - tint;
  const base = tint < 0 ? 0 : 255;
  const rr = parseInt(rgb.slice(0, 2), 16);
  const gg = parseInt(rgb.slice(2, 4), 16);
  const bb = parseInt(rgb.slice(4, 6), 16);
  const fix = (c) => Math.round(base + (c - base) * lum).toString(16).padStart(2, "0");
  return (fix(rr) + fix(gg) + fix(bb)).toUpperCase();
}

// Warna style -> hex RRGGBB lengkap mengingat theme & indexed palette.
function resolveColor(colorXml, themeColors) {
  if (!colorXml) return null;
  const rgb = attrVal(colorXml, "rgb");
  if (rgb && /^[0-9A-Fa-f]{6,8}$/.test(rgb)) return rgb.slice(-6).toUpperCase();
  const theme = attrVal(colorXml, "theme");
  if (theme != null) {
    const base = themeColors[parseInt(theme, 10)];
    if (base) {
      const tintStr = attrVal(colorXml, "tint");
      return applyTint(base, tintStr ? parseFloat(tintStr) : 0);
    }
    return null;
  }
  const indexed = attrVal(colorXml, "indexed");
  if (indexed != null) {
    const hex = INDEXED_COLORS[parseInt(indexed, 10)];
    if (hex) return hex.slice(1).toUpperCase();
  }
  return null;
}

function parseTheme(themeXml) {
  const colors = [];
  if (!themeXml) return colors;
  const scheme = (themeXml.match(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/) || [""])[0];
  const order = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  for (const key of order) {
    const m = new RegExp("<a:" + key + ">([\\s\\S]*?)</a:" + key + ">").exec(scheme);
    if (!m) { colors.push(null); continue; }
    const val = /val="([^"]*)"/.exec(m[1]);
    const lastClr = /lastClr="([^"]*)"/.exec(m[1]);
    const hex = (val && val[1]) || (lastClr && lastClr[1]);
    colors.push(hex ? hex.toUpperCase() : null);
  }
  return colors;
}

function parseStylesXml(stylesXml) {
  const numFmts = {};
  for (const blk of childBlocks(stylesXml, "numFmts")) {
    const re = /<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g;
    let m;
    while ((m = re.exec(blk)) !== null) numFmts[m[1]] = decodeEntities(m[2]);
  }

  const fonts = [];
  for (const inner of childBlocks(stylesXml, "font")) {
    const f = {};
    const name = /<rFont\s+val="([^"]*)"/.exec(inner);
    if (name) f.name = name[1];
    const sz = /<sz\s+val="([^"]*)"/.exec(inner);
    if (sz) f.sz = parseFloat(sz[1]);
    if (/<b\/>/.test(inner)) f.bold = true;
    if (/<i\/>/.test(inner)) f.italic = true;
    if (/<u\s*\/>|<u val=/.test(inner)) f.underline = true;
    f.colorXml = (inner.match(/<color\s+([^>]*?)\/>/) || [null, null])[1];
    fonts.push(f);
  }

  const fills = [];
  for (const inner of childBlocks(stylesXml, "fill")) {
    const pt = /<patternFill\s+patternType="([^"]*)"/.exec(inner);
    const pattern = pt ? pt[1] : null;
    const fgXml = /<fgColor\s+([^>]*?)\/>/.exec(inner);
    const bgXml = /<bgColor\s+([^>]*?)\/>/.exec(inner);
    fills.push({ pattern, fgXml: fgXml ? fgXml[1] : null, bgXml: bgXml ? bgXml[1] : null });
  }

  const borders = [];
  for (const inner of childBlocks(stylesXml, "border")) {
    const b = {};
    for (const side of ["top", "right", "bottom", "left"]) {
      const m = new RegExp("<" + side + "([^>]*)>([\\s\\S]*?)</" + side + ">").exec(inner);
      if (!m) continue;
      const style = attrVal(m[1], "style");
      if (!style || style === "none") continue;
      const colorXml = (m[2].match(/<color\s+([^>]*?)\/>/) || [null, null])[1];
      b[side] = { style, colorXml };
    }
    borders.push(b);
  }

  const cellXfs = [];
  for (const inner of childBlocks(stylesXml, "cellXfs")) {
    // tiap <xf .../> bisa self-closing atau berisi <alignment .../>
    const re = /<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g;
    let m;
    while ((m = re.exec(inner)) !== null) {
      const attrs = m[1] || "";
      const body = m[2] || "";
      const alignment = {};
      const alM = /<alignment\s+([^>]*?)\/>/.exec(body);
      if (alM) {
        const a = alM[1] || "";
        const h = attrVal(a, "horizontal");
        const v = attrVal(a, "vertical");
        if (h) alignment.horizontal = h;
        if (v) alignment.vertical = v;
        if (attrVal(a, "wrapText") === "1") alignment.wrapText = true;
        const rot = attrVal(a, "textRotation");
        if (rot) alignment.textRotation = parseInt(rot, 10);
        if (attrVal(a, "shrinkToFit") === "1") alignment.shrinkToFit = true;
      }
      cellXfs.push({
        numFmtId: parseInt(attrVal(attrs, "numFmtId") || "0", 10),
        fontId: parseInt(attrVal(attrs, "fontId") || "0", 10),
        fillId: parseInt(attrVal(attrs, "fillId") || "0", 10),
        borderId: parseInt(attrVal(attrs, "borderId") || "0", 10),
        applyNumberFormat: attrVal(attrs, "applyNumberFormat") === "1",
        alignment: Object.keys(alignment).length ? alignment : null,
        hasAttrs: Boolean(attrs.trim()),
      });
    }
  }

  return { numFmts, fonts, fills, borders, cellXfs };
}

function partPath(target) {
  let p = target.replace(/^\//, "");
  if (!p.toLowerCase().startsWith("xl/")) p = "xl/" + p;
  return p.replace(/^(xl\/)+/i, "xl/");
}

// Map nama sheet -> path part worksheet (via workbook.xml + rels)
async function sheetParts(zip) {
  const wbXml = await zip.file("xl/workbook.xml").async("string").catch(() => null);
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string").catch(() => null);
  const nameByRid = {};
  if (wbXml) {
    const re = /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g;
    let m;
    while ((m = re.exec(wbXml)) !== null) nameByRid[m[2]] = m[1];
  }
  const ridToTarget = {};
  if (rels) {
    const re = /<Relationship\s+Id="(rId\d+)"[^>]*Type="[^"]*\/worksheet"[^>]*Target="([^"]+)"/g;
    let m;
    while ((m = re.exec(rels)) !== null) ridToTarget[m[1]] = m[2];
  }
  const out = {};
  for (const rid of Object.keys(nameByRid)) {
    const t = ridToTarget[rid];
    if (t) out[nameByRid[rid]] = partPath(t);
  }
  return out;
}

// Map alamat sel -> indeks xf dari XML worksheet (atribut s= pada <c>)
function cellStyleIndexes(sheetXml) {
  const map = {};
  const re = /<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g;
  let m;
  while ((m = re.exec(sheetXml)) !== null) {
    const attrs = m[1] || "";
    const r = attrVal(attrs, "r");
    const s = attrVal(attrs, "s");
    if (!r || s == null) continue;
    map[r] = parseInt(s, 10);
  }
  return map;
}

function buildStyleContext(zip) {
  return Promise.all([
    zip.file("xl/styles.xml").async("string").catch(() => null),
    zip.file("xl/theme/theme1.xml").async("string").catch(() => null),
  ]).then(([stylesXml, themeXml]) => {
    const parsed = parseStylesXml(stylesXml || "<styleSheet/>");
    return { ...parsed, themeColors: parseTheme(themeXml), namesToParts: null };
  });
}

function resolveXfStyle(xf, ctx) {
  const out = {};
  const fnt = ctx.fonts[xf.fontId];
  if (fnt && (fnt.bold || fnt.italic || fnt.underline || (fnt.sz && fnt.sz !== 11) || fnt.name)) {
    const f = {};
    if (fnt.name) f.name = fnt.name;
    if (fnt.sz && fnt.sz > 0) f.sz = fnt.sz;
    if (fnt.bold) f.bold = true;
    if (fnt.italic) f.italic = true;
    if (fnt.underline) f.underline = true;
    const hex = resolveColor("<color " + (fnt.colorXml || "") + "/>", ctx.themeColors);
    if (hex) f.color = { rgb: "FF" + hex };
    if (Object.keys(f).length) out.font = f;
  }

  const fl = ctx.fills[xf.fillId];
  if (fl && (fl.pattern === "solid" || fl.pattern === "darkGray" || fl.pattern === "gray25")) {
    const hex = resolveColor("<color " + fl.fgXml + "/>", ctx.themeColors) ||
      resolveColor("<color " + fl.bgXml + "/>", ctx.themeColors);
    if (hex && hex !== "FFFFFF") {
      out.fill = { patternType: "solid", fgColor: { rgb: "FF" + hex } };
    }
  }

  const bd = ctx.borders[xf.borderId];
  if (bd && Object.keys(bd).length) {
    const border = {};
    for (const side of ["top", "right", "bottom", "left"]) {
      const s = bd[side];
      if (!s) continue;
      const hex = resolveColor("<color " + (s.colorXml || "") + "/>", ctx.themeColors) || "000000";
      border[side] = { style: s.style, color: { rgb: "FF" + hex } };
    }
    out.border = border;
  }

  if (xf.alignment) out.alignment = xf.alignment;

  let numFmt = null;
  if (xf.numFmtId && xf.numFmtId !== 0) {
    const code = ctx.numFmts[String(xf.numFmtId)] || BUILTIN_NUMFMTS[String(xf.numFmtId)];
    if (code && code !== "General") numFmt = code;
  } else if (xf.applyNumberFormat) {
    const code = ctx.numFmts[String(xf.numFmtId)];
    if (code && code !== "General") numFmt = code;
  }

  return { style: Object.keys(out).length ? out : null, numFmt };
}

// Parse <sheetViews><sheetView><pane> menjadi { xSplit, ySplit, topLeftCell, state }.
// SheetJS (xlsx-js-style) TIDAK mengekspos pane, jadi dibaca langsung dari XML
// sheet agar freeze pane file asli ikut dipertahankan. xSplit/ySplit dinyatakan
// Excel dalam satuan 1/16 lebar karakter; konversi ke jumlah kolom/baris.
export function paneFromSheetXml(sheetXml) {
  try {
    const views = childBlocks(sheetXml, "sheetViews");
    const view = views[0];
    if (view == null) return null;
    const paneXml = (childBlocks(view, "sheetView")[0] || "").match(/<pane\b[^>]*\/>/g) || null;
    if (!paneXml) return null;
    const attrs = (paneXml[0] || "").match(/<pane\b([^>]*)\/?>/)[1];
    const state = attrVal(attrs, "state");
    if (state !== "frozen" && state !== "split") return null;
    const xSplitRaw = attrVal(attrs, "xSplit") ? parseInt(attrVal(attrs, "xSplit"), 10) : 0;
    const ySplitRaw = attrVal(attrs, "ySplit") ? parseInt(attrVal(attrs, "ySplit"), 10) : 0;
    const xSplit = xSplitRaw > 0 ? Math.max(1, Math.round(xSplitRaw / 16)) : 0;
    const ySplit = ySplitRaw > 0 ? Math.max(1, Math.round(ySplitRaw / 16)) : 0;
    const topLeftRaw = attrVal(attrs, "topLeftCell");
    let topLeftCell = { r: 0, c: 0 };
    if (topLeftRaw && /^[A-Za-z]+\d+$/.test(topLeftRaw)) {
      const m = /^([A-Za-z]+)(\d+)$/.exec(topLeftRaw);
      let c = 0;
      for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
      topLeftCell = { r: parseInt(m[2], 10) - 1, c: c - 1 };
    }
    if (!xSplit && !ySplit) return null;
    return { xSplit, ySplit, topLeftCell, state: "frozen" };
  } catch (_) {
    return null;
  }
}

/**
 * Baca style mentah dari zip lalu suntikkan ke cell.s workbook SheetJS.
 * Juga menghasilkan manifest style ({sheet:{addr:style}}) agar setelah file
 * disimpan ulang (base64) & dibaca lagi, style bisa dipulihkan tanpa jszip.
 * Freeze pane (<pane>) per sheet ikut dibaca dan disimpan ke sheet["!freeze"].
 */
export async function enrichWorkbookFromZip(wb, zip) {
  const ctx = await buildStyleContext(zip);
  const parts = await sheetParts(zip);
  const manifest = {};
  const total = { borderSides: 0, styledCells: 0 };

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const part = parts[name];
    if (!sheet) continue;
    const mat = {};
    if (part) {
      const sheetXml = await zip.file(part).async("string").catch(() => null);
      if (sheetXml) {
        const map = cellStyleIndexes(sheetXml);
        for (const addr of Object.keys(map)) {
          const cell = sheet[addr];
          if (!cell) continue;
          const xf = ctx.cellXfs[map[addr]];
          if (!xf) continue;
          const { style, numFmt } = resolveXfStyle(xf, ctx);
          if (style) {
            cell.s = style;
            mat[addr] = style;
            total.styledCells++;
            if (style.border) total.borderSides += Object.keys(style.border).length;
          }
          if (!cell.z && numFmt) cell.z = numFmt;
        }
        // Freeze pane (bila file memakainya) dipertahankan apa adanya.
        const pane = paneFromSheetXml(sheetXml);
        if (pane) sheet["!freeze"] = pane;
      }
    }
    if (Object.keys(mat).length) manifest[name] = mat;
  }

  wb.__stylesManifest = manifest;
  wb.__rawStyleTotals = total;
  return wb;
}

/**
 * Pulihkan style ke workbook yang baru dibaca ulang dari base64/buffer,
 * menggunakan manifest yang disimpan saat import (sinkron, tanpa jszip).
 */
export function applyStylesManifest(wb, manifest) {
  if (!manifest || !wb) return wb;
  for (const name of Object.keys(manifest)) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    for (const addr of Object.keys(manifest[name])) {
      const style = manifest[name][addr];
      if (!style) continue;
      let cell = sheet[addr];
      if (!cell) cell = (sheet[addr] = { t: "z", v: undefined });
      cell.s = style;
    }
  }
  return wb;
}

/** Convenience: ini jalur penuh dari buffer xlsx (buka zip => enrich). */
export async function enrichWorkbookFromBuffer(wb, buffer) {
  const zip = await openFileZip(buffer);
  return enrichWorkbookFromZip(wb, zip);
}