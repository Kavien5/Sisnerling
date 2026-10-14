const ExcelJS = require("exceljs");

const FILES = [
  { code: "F3", nama: "1. LK Neraca Fisik & Moneter Hutan.xlsx", abs: "C:/laragon/www/sisnerling/Sisnerling/server/storage/templates/neraca-hutan.xlsx" },
  { code: "F4", nama: "01 LK Neraca Aset Mineral dan Energi 2025.xlsx", abs: "C:/laragon/www/sisnerling/Sisnerling/server/storage/templates/neraca-mineral-energi.xlsx" },
];

const EXT_RE = /\[(\d+)\](?:'[^']+'|[A-Za-z0-9_. ]+)!/g;
// Rujukan workbook lain yang dikutip: '[1]Nama Sheet'!A1
const EXTQ_RE = /'\[\d+\][^']*'!/g;
// Deteksi umum: setiap [n] = referensi ke file luar.
const EXT_ANY_RE = /\[\d+\]/;
const A1_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

function colNum(L) { let n = 0; for (const ch of L.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function a1ToRC(addr) { const mm = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})/.exec(addr); return mm ? [parseInt(mm[2], 10), colNum(mm[1])] : null; }

function raw(cell) {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "object") {
    if (v instanceof Date) return { kind: "date", result: v, text: cell.text };
    if (v.formula !== undefined) return { kind: "formula", formula: v.formula, result: v.result, text: cell.text, shared: v.ref || null, master: null };
    if (v.sharedFormula !== undefined) return { kind: "formula", formula: null, result: v.result, text: cell.text, shared: null, master: v.sharedFormula };
    if (v.richText) return { kind: "text", result: v.richText.map((t) => t.text).join(""), text: cell.text };
    if (v.text !== undefined && v.hyperlink !== undefined) return { kind: "text", result: v.text, text: cell.text };
    if (v.result !== undefined) return { kind: "formula", formula: null, result: v.result, text: cell.text, shared: null, master: null };
    return { kind: "text", result: JSON.stringify(v), text: cell.text };
  }
  if (typeof v === "number") return { kind: "number", result: v, text: cell.text };
  if (typeof v === "string") return { kind: "text", result: v, text: cell.text };
  if (typeof v === "boolean") return { kind: "bool", result: v, text: cell.text };
  return { kind: "text", result: String(v), text: cell.text };
}

function classify(formula) {
  if (formula == null) return { tipe: "input", ext: false };
  const ext = EXT_ANY_RE.test(formula);
  EXT_RE.lastIndex = 0;
  const cleaned = formula.replace(EXTQ_RE, " ").replace(EXT_RE, " ");
  EXT_RE.lastIndex = 0;
  const hasRef = /\$?[A-Za-z]{1,3}\$?\d{1,7}/.test(cleaned) || /[A-Za-z_][A-Za-z0-9_. ]*!/.test(cleaned);
  if (ext) return { tipe: "fim", ext: true };
  if (hasRef) return { tipe: "hf", ext: false };
  return { tipe: "input", ext: false };
}

function refsOf(formula, sheetName) {
  const out = { ext: 0, same: 0, other: new Set() };
  if (formula == null) return out;
  let s = formula;
  EXT_RE.lastIndex = 0;
  const extMatches = s.match(EXT_RE) || [];
  const extQuoted = s.match(EXTQ_RE) || [];
  out.ext = extMatches.length + extQuoted.length;
  s = s.replace(EXTQ_RE, " ").replace(EXT_RE, " ");
  EXT_RE.lastIndex = 0;
  const qualRe = /(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_. ]*?))!\$?[A-Za-z]{1,3}\$?\d{1,7}/g;
  let m;
  while ((m = qualRe.exec(s))) {
    const name = (m[1] || m[2] || "").trim();
    if (name && name !== sheetName) out.other.add(name);
  }
  s = s.replace(qualRe, " ");
  const bare = s.match(/\$?[A-Za-z]{1,3}\$?\d{1,7}/g) || [];
  out.same = bare.length;
  return out;
}

function valStr(c) {
  if (!c) return "";
  if (c.kind === "formula" && c.formula != null) return "=" + c.formula;
  const r = c.result;
  if (r == null) return "";
  if (typeof r === "number") {
    const a = Math.abs(r);
    return a !== 0 && (a >= 1e7 || a < 1e-4) ? r.toExponential(4) : String(+r.toFixed(6));
  }
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  if (typeof r === "string" && r !== "[object Object]") return String(r);
  if (c.text && c.text !== "[object Object]") return c.text;
  return "";
}

function isFormula(c) { return c && c.kind === "formula"; }
function isNumLike(c) { return c && (c.kind === "number" || (c.kind === "formula" && typeof c.result === "number")); }
function isTexty(c) { return c && (c.kind === "text" ? !!String(c.result).trim() : (c.kind === "formula" && typeof c.result === "string" && !!String(c.result).trim())); }
const NONAME_RE = /^[-\d.,%()\s/]*$/;

function esc(v) { return String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\n/g, " ").trim(); }

function buildGrid(ws) {
  const grid = {};
  let maxR = 0, maxC = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const c = raw(cell);
      if (!c) return;
      grid[cell.row + "," + cell.col] = Object.assign(c, { row: cell.row, col: cell.col, a1: cell.address, numFmt: cell.numFmt });
      if (cell.row > maxR) maxR = cell.row;
      if (cell.col > maxC) maxC = cell.col;
    });
  });
  return { grid, maxR, maxC };
}

function masterFormula(grid, masterAddr) {
  if (!masterAddr) return null;
  const pos = a1ToRC(masterAddr);
  if (!pos) return null;
  const lead = grid[pos[0] + "," + pos[1]];
  if (!lead) return null;
  if (lead.formula != null) return lead.formula;
  return masterFormula(grid, lead.master);
}

function blocks(grid, maxR, maxC) {
  const rowFilled = (r) => { for (let cc = 1; cc <= maxC; cc++) if (grid[r + "," + cc]) return true; return false; };
  const res = [];
  let start = null;
  for (let r = 1; r <= maxR + 1; r++) {
    const f = r <= maxR && rowFilled(r);
    if (f && start == null) start = r;
    if (!f && start != null) { res.push([start, r - 1]); start = null; }
  }
  return res.filter(([a, b]) => b - a >= 0);
}

function analyzeSheet(ws, customBlocks) {
  const { grid, maxR, maxC } = buildGrid(ws);
  const blks = customBlocks || blocks(grid, maxR, maxC);
  const rowsOut = [];
  blks.forEach(([r1, r2], bi) => {
    const height = r2 - r1 + 1;
    const colm = {};
    for (let c = 1; c <= maxC; c++) {
      let filled = 0, numeric = 0, text = 0;
      for (let r = r1; r <= r2; r++) {
        const cc = grid[r + "," + c];
        if (!cc) continue;
        filled++;
        if (isNumLike(cc)) numeric++;
        if (isTexty(cc)) text++;
      }
      colm[c] = { filled, numeric, text };
    }
    let firstTextCol = maxC + 1;
    for (let c = 1; c <= maxC; c++) {
      if (colm[c].text >= 2) { firstTextCol = c; break; }
    }
    const numbering = [];
    if (firstTextCol <= maxC) {
      for (let c = 1; c < firstTextCol; c++) {
        const m = colm[c];
        if (m.numeric >= 2 && m.numeric >= m.text) numbering.push(c);
      }
    }
    let dataCols = [];
    for (let c = 1; c <= maxC; c++) {
      if (numbering.includes(c)) continue;
      const m = colm[c];
      if (m.filled >= 2 && m.numeric >= 2 && m.numeric >= m.text) dataCols.push(c);
    }
    if (!dataCols.length) {
      for (let c = 1; c <= maxC; c++) {
        if (numbering.includes(c)) continue;
        if (colm[c].numeric >= 1) dataCols.push(c);
      }
    }
    const labelCols = [];
    for (let c = 1; c <= maxC; c++) {
      if (!dataCols.includes(c) && !numbering.includes(c) && colm[c].filled > 0) labelCols.push(c);
    }
    const allText = dataCols.length === 0;

    for (let r = r1; r <= r2; r++) {
      if (allText) {
        const parts = [];
        let prev = null;
        for (let c = 1; c <= maxC; c++) {
          const cc = grid[r + "," + c];
          if (cc && isTexty(cc)) {
            const t = String(cc.result).trim();
            if (t && !NONAME_RE.test(t) && t !== prev) { parts.push(t); prev = t; }
          }
        }
        const n = (() => { let k = 0; for (let c = 1; c <= maxC; c++) if (grid[r + "," + c]) k++; return k; })();
        rowsOut.push({
          block: bi, blkR1: r1, blkR2: r2, sheet: ws.name, row: r,
          label: parts.join(" / "), n, range: "(teks)", sample: "", tipe: "input manual",
          rule: [], otherSheets: [], extCount: 0,
        });
        continue;
      }

      const labelParts = [];
      let prev = null;
      for (const c of labelCols) {
        const cc = grid[r + "," + c];
        if (cc && isTexty(cc)) {
          const t = String(cc.result).trim();
          if (t && !NONAME_RE.test(t) && t !== prev) { labelParts.push(t); prev = t; }
        }
      }
      const dataCells = [];
      for (const c of dataCols) {
        const cc = grid[r + "," + c];
        if (cc) dataCells.push(cc);
      }
      const numCells = dataCells.filter((cd) => isNumLike(cd) || isFormula(cd));
      if (numCells.length === 0) {
        const parts = [];
        let pprev = null;
        for (let c = 1; c <= maxC; c++) {
          const cc = grid[r + "," + c];
          if (cc && isTexty(cc)) {
            const t = String(cc.result).trim();
            if (t && !NONAME_RE.test(t) && t !== pprev) { parts.push(t); pprev = t; }
          }
        }
        let nt = 0; for (let c = 1; c <= maxC; c++) if (grid[r + "," + c]) nt++;
        rowsOut.push({
          block: bi, blkR1: r1, blkR2: r2, sheet: ws.name, row: r,
          label: parts.join(" / "), n: nt, range: "(teks)", sample: "", tipe: "input manual",
          rule: [], otherSheets: [], extCount: 0,
        });
        continue;
      }
      if (!labelParts.length) {
        for (let c = 1; c <= maxC; c++) {
          const cc = grid[r + "," + c];
          if (!cc) continue;
          if (isTexty(cc)) {
            const t = String(cc.result).trim();
            if (t && !NONAME_RE.test(t)) { labelParts.push(t); break; }
          }
        }
      }
      if (!labelParts.length) {
        for (let c = 1; c <= maxC; c++) {
          const cc = grid[r + "," + c];
          if (cc && isNumLike(cc)) { labelParts.push(valStr(cc)); break; }
        }
      }

      let im = 0, hf = 0, fim = 0;
      const templates = new Map();
      const otherSheets = new Set();
      let extCount = 0;
      for (const cd of numCells) {
        const c = cd;
        if (!isFormula(c)) { im++; continue; }
        const formula = c.formula != null ? c.formula : masterFormula(grid, c.master);
        const cl = classify(formula);
        if (cl.tipe === "fim") fim++; else if (cl.tipe === "hf") hf++; else im++;
        if (formula != null) {
          const key = formula.replace(/[0-9]+/g, "#");
          templates.set(key, (templates.get(key) || 0) + 1);
        }
        const rf = refsOf(formula, ws.name);
        rf.other.forEach((s) => otherSheets.add(s));
        extCount += rf.ext;
      }
      const parts = [];
      if (im) parts.push(im + " input manual");
      if (hf) parts.push(hf + " hasil formulasi");
      if (fim) parts.push(fim + " formula tapi input manual");
      const tipe = parts.join(" + ") || "input manual";

      const sampleCells = numCells.length ? numCells.slice(0, 1).concat(numCells.slice(-1)) : [];
      const sample = sampleCells.map((x) => valStr(x)).filter(Boolean).join("…");
      const range = numCells.length ? `${numCells[0].a1}..${numCells[numCells.length - 1].a1}` : "(x)";

      rowsOut.push({
        block: bi, blkR1: r1, blkR2: r2, sheet: ws.name, row: r,
        label: labelParts.join(" / "), n: numCells.length, range, sample,
        rule: [...templates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => (v > 1 ? `${k}  (×${v})` : k)),
        tipe, otherSheets: [...otherSheets], extCount,
      });
    }
  });
  return rowsOut;
}

module.exports = { FILES, analyzeSheet, buildGrid, masterFormula, refsOf, valStr, isFormula, isNumLike, isTexty, esc, blocks, raw, colNum, a1ToRC };