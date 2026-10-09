import { formatRupiah } from "./api.js";

export const ERR = {
  DIV0: "#DIV/0!",
  REF: "#REF!",
  NAME: "#NAME?",
  VALUE: "#VALUE!",
  CYCLE: "#CYCLE!",
  ERR: "#ERROR!",
  REF_FILE: "#REF! File sumber belum tersedia",
};

// Kunci nama file untuk referensi antar-file (File!Sheet!Cell). Nama dikunci
// UPPERCASE agar "Neraca.xlsx" dan "NERACA.XLSX" dianggap sama; ekstensi
// dipisah oleh pemanggil (ExcelEditor) agar ".xlsx" & tanpa ekstensi cocok.
export function normalizeFileKey(key) {
  return String(key ?? "").toUpperCase();
}

export function isErrorValue(v) {
  return typeof v === "string" && v.startsWith("#");
}

// ============ kolom & referensi ============

export function colName(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(name) {
  let col = 0;
  for (const ch of String(name).toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return col - 1;
}

export function parseRef(ref) {
  const t = String(ref || "").replace(/\$/g, "").trim();
  const m = /^([A-Za-z]+)(\d+)?$/.exec(t);
  if (!m) return null;
  return { col: colIndex(m[1]), row: m[2] ? parseInt(m[2], 10) - 1 : null };
}

export function cellAddress(colIdx, rowIdx) {
  return `${colName(colIdx)}${rowIdx + 1}`;
}

// ============ pergeseran referensi rumus (copy/paste/move/insert) ============
//
// Semua helper di bawah menggeser referensi sel pada sebuah formula SUKAI Excel:
// referensi absolut ($A$1) tidak digeser; referensi ke sheet lain ("Sheet!B4")
// ikut digeser; string teks tidak diubah.

function makeShiftRef(dRow, dCol, range) {
  return (ref) => {
    const m = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(ref);
    if (!m) return ref;
    const cAbs = m[1] === "$";
    const colS = m[2];
    const rAbs = m[3] === "$";
    let c = colIndex(colS);
    let r = parseInt(m[4], 10) - 1;
    if (range !== null) {
      if (c < range.c1 || c > range.c2 || r < range.r1 || r > range.r2) return ref;
    }
    if (!cAbs) c += dCol || 0;
    if (!rAbs) r += dRow || 0;
    if (c < 0 || r < 0) return ERR.REF;
    return (cAbs ? "$" : "") + colName(c) + (rAbs ? "$" : "") + (r + 1);
  };
}

function transformFormulaRefs(formula, fn) {
  if (!formula || typeof formula !== "string") return formula;
  const n = formula.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const ch = formula[i];
    if (ch === '"') {
      // String teks: disalin verbatim hingga tanda kutip penutup.
      const close = formula.indexOf('"', i + 1);
      const end = close >= 0 ? close + 1 : n;
      out += formula.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "'") {
      // Nama sheet yang dikutip: 'Sheet Name'!B4
      const close = formula.indexOf("'", i + 1);
      if (close >= 0 && formula[close + 1] === "!") {
        const refM = /^(\$?[A-Za-z]{1,4}\$?\d+)/.exec(formula.slice(close + 2));
        if (refM) {
          out += formula.slice(i, close + 1) + "!" + fn(refM[1]);
          i = close + 2 + refM[1].length;
          continue;
        }
        out += formula.slice(i, close + 1);
        i = close + 1;
        continue;
      }
    }
    // Referensi dengan sheet: Sheet1!B4
    const sheetM = /^([A-Za-z_][A-Za-z0-9_.]*)!(\$?[A-Za-z]{1,4}\$?\d+)/.exec(formula.slice(i));
    if (sheetM) {
      out += sheetM[1] + "!" + fn(sheetM[2]);
      i += sheetM[1].length + 1 + sheetM[2].length;
      continue;
    }
    const refM = /^\$?[A-Za-z]{1,4}\$?\d+/.exec(formula.slice(i));
    if (refM) {
      out += fn(refM[0]);
      i += refM[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Copy / fill / drag: SEMUA referensi relatif ikut bergeser sesuai perpindahan.
export function shiftFormulaRefs(formula, dRow, dCol) {
  return transformFormulaRefs(formula, makeShiftRef(dRow || 0, dCol || 0, null));
}

// Cut / move: hanya referensi yang MENUNJUK ke dalam area yang dipindah yang
// digeser; referensi di luar area sumber tidak disentuh.
export function shiftFormulaRefsInRange(formula, dRow, dCol, range) {
  if (!range) return formula;
  return transformFormulaRefs(formula, makeShiftRef(dRow || 0, dCol || 0, range));
}

// Insert baris: referensi relatif pada baris >= atRow bergeser turun dRow.
export function shiftFormulaRefsRowInsert(formula, atRow, dRow) {
  const dy = dRow || 1;
  return transformFormulaRefs(formula, (ref) => {
    const m = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(ref);
    if (!m) return ref;
    const rAbs = m[3] === "$";
    let r = parseInt(m[4], 10) - 1;
    if (rAbs || r < atRow) return ref;
    return (m[1] === "$" ? "$" : "") + m[2] + (rAbs ? "$" : "") + (r + 1 + dy);
  });
}

// Insert kolom: referensi relatif pada kolom >= atCol bergeser ke kanan dx.
export function shiftFormulaRefsColumnInsert(formula, atCol, dx) {
  const d = dx || 1;
  return transformFormulaRefs(formula, (ref) => {
    const m = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(ref);
    if (!m) return ref;
    const cAbs = m[1] === "$";
    let c = colIndex(m[2]);
    if (cAbs || c < atCol) return ref;
    return (cAbs ? "$" : "") + colName(c + d) + (m[3] === "$" ? "$" : "") + m[4];
  });
}

// ============ tokenizer & parser ============

class EvalError extends Error {}

function tokenize(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      const num = parseFloat(src.slice(i, j));
      if (!Number.isFinite(num)) throw new EvalError(ERR.VALUE);
      out.push({ type: "num", value: num });
      i = j;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let s = "";
      while (j < n && src[j] !== "'") {
        s += src[j];
        j++;
      }
      if (src[j] !== "'") throw new EvalError(ERR.VALUE);
      out.push({ type: "id", value: s.toUpperCase() });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (word === "TRUE" || word === "true") out.push({ type: "bool", value: true });
      else if (word === "FALSE" || word === "false") out.push({ type: "bool", value: false });
      else out.push({ type: "id", value: word.toUpperCase() });
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = "";
      while (j < n && src[j] !== '"') {
        s += src[j];
        j++;
      }
      if (src[j] !== '"') throw new EvalError(ERR.VALUE);
      out.push({ type: "str", value: s });
      i = j + 1;
      continue;
    }
    const two = src.substr(i, 2);
    if (two === "<=" || two === ">=" || two === "<>" || two === "==" || two === "!=") {
      out.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    if ("+-*/^(),:;&%!".includes(ch)) {
      out.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if ("=<>".includes(ch)) {
      out.push({ type: "op", value: ch });
      i++;
      continue;
    }
    throw new EvalError(ERR.VALUE);
  }
  return out;
}

class Parser {
  constructor(tokens) {
    this.toks = tokens;
    this.pos = 0;
  }
  peek() {
    return this.toks[this.pos];
  }
  next() {
    return this.toks[this.pos++];
  }
  expectOp(op) {
    const t = this.next();
    if (!t || t.type !== "op" || t.value !== op) throw new EvalError(ERR.VALUE);
  }
  matchOp(op) {
    const t = this.peek();
    if (t && t.type === "op" && t.value === op) {
      this.pos++;
      return true;
    }
    return false;
  }
  parseExpr() {
    return this.parseCompare();
  }
  parseCompare() {
    let left = this.parseAdd();
    for (;;) {
      const t = this.peek();
      if (t && t.type === "op" && [">=", "<=", "<>", "==", "!=", "=", "<", ">"].includes(t.value)) {
        this.next();
        const right = this.parseAdd();
        left = { type: "bin", op: t.value, left, right };
      } else break;
    }
    return left;
  }
  parseAdd() {
    let left = this.parseMul();
    for (;;) {
      const t = this.peek();
      if (t && t.type === "op" && (t.value === "+" || t.value === "-" || t.value === "&")) {
        this.next();
        const right = this.parseMul();
        left = { type: "bin", op: t.value, left, right };
      } else break;
    }
    return left;
  }
  parseMul() {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t && t.type === "op" && ["*", "/", "^"].includes(t.value)) {
        this.next();
        const right = this.parseUnary();
        left = { type: "bin", op: t.value, left, right };
      } else break;
    }
    return left;
  }
  parseUnary() {
    if (this.matchOp("-")) return { type: "neg", operand: this.parseUnary() };
    if (this.matchOp("+")) return { type: "pos", operand: this.parseUnary() };
    return this.parsePrimary();
  }
  parsePrimary() {
    const t = this.next();
    if (!t) throw new EvalError(ERR.VALUE);
    let node;
    if (t.type === "num") node = { type: "lit", value: t.value };
    else if (t.type === "str") node = { type: "lit", value: t.value };
    else if (t.type === "bool") node = { type: "lit", value: t.value };
    else if (t.type === "op" && t.value === "(") {
      node = this.parseExpr();
      this.expectOp(")");
    } else if (t.type === "id") {
      const next = this.peek();
      if (next && next.type === "op" && next.value === "!") {
        this.next();
        const cell = this.next();
        if (!cell || cell.type !== "id") throw new EvalError(ERR.REF);
        const after = this.peek();
        if (after && after.type === "op" && after.value === "!") {
          // Referensi antar-file: File!Sheet!Cell / File!Sheet!A1:B2. Nama file
          // dikutip ('Nama File.xlsx') atau polos (NamaFile!Sheet!Cell).
          this.next();
          const cell2 = this.next();
          if (!cell2 || cell2.type !== "id") throw new EvalError(ERR.REF);
          const after2 = this.peek();
          if (after2 && after2.type === "op" && after2.value === ":") {
            this.next();
            const t3 = this.next();
            if (!t3 || t3.type !== "id") throw new EvalError(ERR.REF);
            node = { type: "fileSheetRange", file: t.value, sheet: cell.value, from: cell2.value, to: t3.value };
          } else {
            node = { type: "fileSheetRef", file: t.value, sheet: cell.value, ref: cell2.value };
          }
        } else if (after && after.type === "op" && after.value === ":") {
          this.next();
          const t2 = this.next();
          if (!t2 || t2.type !== "id") throw new EvalError(ERR.REF);
          node = { type: "sheetRange", sheet: t.value, from: cell.value, to: t2.value };
        } else {
          node = { type: "sheetRef", sheet: t.value, ref: cell.value };
        }
      } else if (next && next.type === "op" && next.value === "(") {
        this.next();
        const args = [];
        const matchSep = () => this.matchOp(",") || this.matchOp(";");
        if (!this.matchOp(")")) {
          do {
            args.push(this.parseExpr());
          } while (matchSep());
          this.expectOp(")");
        }
        node = { type: "func", name: t.value, args };
      } else if (next && next.type === "op" && next.value === ":") {
        this.next();
        const t2 = this.next();
        if (!t2 || t2.type !== "id") throw new EvalError(ERR.VALUE);
        node = { type: "range", from: t.value, to: t2.value };
      } else {
        node = { type: "ref", ref: t.value };
      }
    } else {
      throw new EvalError(ERR.VALUE);
    }
    if (this.matchOp("%")) {
      return { type: "bin", op: "/", left: node, right: { type: "lit", value: 100 } };
    }
    return node;
  }
}

// ============ evaluasi ============

function toExcelSerial(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) throw new EvalError(ERR.VALUE);
  const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return (ms - Date.UTC(1899, 11, 30)) / 86400000;
}

// Teks ISO "YYYY-MM-DD[ HH:MM]" dianggap tanggal → serial Excel.
function dateSerialFromText(s) {
  const m = String(s).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return (ms - Date.UTC(1899, 11, 30)) / 86400000;
}

// Konversi sumber tanggal apa pun (Date, serial Excel, atau teks ISO) → Date.
function asDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const d = new Date((v - 25569) * 86400000 + 500);
    if (!isNaN(d.getTime())) return d;
  }
  const ds = dateSerialFromText(v);
  if (ds !== null) return new Date((ds - 25569) * 86400000 + 500);
  return null;
}

function toNum(v) {
  if (Array.isArray(v)) {
    if (v.length === 1) return toNum(v[0]);
    throw new EvalError(ERR.VALUE);
  }
  if (isErrorValue(v)) throw new EvalError(v);
  if (v instanceof Date) return toExcelSerial(v);
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v ?? "").trim();
  if (s === "") return 0;
  const n = parseNumberText(s);
  if (n !== null) return n;
  const ds = dateSerialFromText(s);
  if (ds !== null) return ds;
  throw new EvalError(ERR.VALUE);
}

function numLike(a, b) {
  const isD = (v) => v instanceof Date;
  const na = typeof a === "number" || (typeof a === "string" && parseNumberText(a) !== null) || isD(a);
  const nb = typeof b === "number" || (typeof b === "string" && parseNumberText(b) !== null) || isD(b);
  return { na, nb };
}

function applyBin(op, a, b) {
  if (op === "&") return String(a ?? "") + String(b ?? "");
  if (["+", "-", "*", "/", "^"].includes(op)) {
    const x = toNum(a);
    const y = toNum(b);
    switch (op) {
      case "+":
        return x + y;
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        if (y === 0) throw new EvalError(ERR.DIV0);
        return x / y;
      case "^":
        return Math.pow(x, y);
    }
  }
  const { na, nb } = numLike(a, b);
  const x = na && nb ? toNum(a) : String(a ?? "");
  const y = na && nb ? toNum(b) : String(b ?? "");
  switch (op) {
    case "=":
    case "==":
      return x === y;
    case "<>":
    case "!=":
      return x !== y;
    case "<":
      return x < y;
    case ">":
      return x > y;
    case "<=":
      return x <= y;
    case ">=":
      return x >= y;
  }
  throw new EvalError(ERR.VALUE);
}

function truthy(v) {
  if (isErrorValue(v)) throw new EvalError(v);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return String(v ?? "").trim() !== "" && String(v).trim().toUpperCase() !== "FALSE";
}

function toNumIfNum(v) {
  if (Array.isArray(v)) {
    if (v.length === 1) return toNumIfNum(v[0]);
    throw new EvalError(ERR.VALUE);
  }
  if (isErrorValue(v)) throw new EvalError(v);
  if (v instanceof Date) return toExcelSerial(v);
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v ?? "").trim();
  if (s === "") return null;
  return parseNumberText(s);
}

// Bentangkan argumen satu tingkat: rentang (array) menjadi nilai-nilai
// penyusunnya. Dipakai fungsi agregat yang menerima banyak nilai/run.
function flatVals(args) {
  const out = [];
  for (const v of args) {
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  }
  return out;
}

// Ambil nilai skalar: rentang satu sel di-unwrap (irisan implisit seperti
// Excel); rentang multi-sel → #VALUE!. Dipakai fungsi yang butuh satu nilai.
function scalar(v) {
  if (Array.isArray(v)) {
    if (v.length === 1) return scalar(v[0]);
    throw new EvalError(ERR.VALUE);
  }
  return v;
}

const FUNCS = {
  SUM: (args) => {
    let s = 0;
    for (const v of flatVals(args)) {
      const n = toNumIfNum(v);
      if (n !== null) s += n;
    }
    return s;
  },
  SUMIF: (args) => {
    if (args.length < 2) throw new EvalError(ERR.VALUE);
    const range = Array.isArray(args[0]) ? args[0] : [args[0]];
    const criteria = scalar(args[1]);
    const sumRange = args.length >= 3 ? (Array.isArray(args[2]) ? args[2] : [args[2]]) : range;
    let s = 0;
    for (let i = 0; i < range.length; i++) {
      if (matchCriteria(range[i], criteria)) {
        const n = toNumIfNum(sumRange[i]);
        if (n !== null) s += n;
      }
    }
    return s;
  },
  SUMIFS: (args) => {
    if (args.length < 3 || args.length % 2 !== 1) throw new EvalError(ERR.VALUE);
    const sumRange = Array.isArray(args[0]) ? args[0] : [args[0]];
    const pairs = [];
    for (let i = 1; i < args.length; i += 2) {
      pairs.push({
        range: Array.isArray(args[i]) ? args[i] : [args[i]],
        criteria: scalar(args[i + 1]),
      });
    }
    const n = Math.min(sumRange.length, ...pairs.map((p) => p.range.length));
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (pairs.every((p) => matchCriteria(p.range[i], p.criteria))) {
        const v = toNumIfNum(sumRange[i]);
        if (v !== null) s += v;
      }
    }
    return s;
  },
  AVERAGE: (args) => {
    let s = 0;
    let c = 0;
    for (const v of flatVals(args)) {
      const n = toNumIfNum(v);
      if (n !== null) {
        s += n;
        c++;
      }
    }
    return c ? s / c : 0;
  },
  AVG: (args) => FUNCS.AVERAGE(args),
  AVERAGEIF: (args) => {
    if (args.length < 2) throw new EvalError(ERR.VALUE);
    const range = Array.isArray(args[0]) ? args[0] : [args[0]];
    const criteria = scalar(args[1]);
    const avgRange = args.length >= 3 ? (Array.isArray(args[2]) ? args[2] : [args[2]]) : range;
    let s = 0;
    let c = 0;
    for (let i = 0; i < range.length; i++) {
      if (matchCriteria(range[i], criteria)) {
        const n = toNumIfNum(avgRange[i]);
        if (n !== null) {
          s += n;
          c++;
        }
      }
    }
    return c ? s / c : 0;
  },
  COUNT: (args) => {
    let c = 0;
    for (const v of flatVals(args)) {
      if (toNumIfNum(v) !== null) c++;
    }
    return c;
  },
  COUNTA: (args) => {
    let c = 0;
    for (const v of flatVals(args)) {
      if (isErrorValue(v)) throw new EvalError(v);
      if (v !== null && v !== undefined && String(v).trim() !== "") c++;
    }
    return c;
  },
  COUNTIF: (args) => {
    if (args.length < 2) throw new EvalError(ERR.VALUE);
    const range = Array.isArray(args[0]) ? args[0] : [args[0]];
    const criteria = scalar(args[1]);
    let c = 0;
    for (const v of range) {
      if (matchCriteria(v, criteria)) c++;
    }
    return c;
  },
  COUNTIFS: (args) => {
    if (args.length < 2 || args.length % 2 !== 0) throw new EvalError(ERR.VALUE);
    const pairs = [];
    for (let i = 0; i < args.length; i += 2) {
      pairs.push({
        range: Array.isArray(args[i]) ? args[i] : [args[i]],
        criteria: scalar(args[i + 1]),
      });
    }
    const n = Math.min(...pairs.map((p) => p.range.length));
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (pairs.every((p) => matchCriteria(p.range[i], p.criteria))) c++;
    }
    return c;
  },
  MAX: (args) => {
    let m = null;
    for (const v of flatVals(args)) {
      const n = toNumIfNum(v);
      if (n !== null && (m === null || n > m)) m = n;
    }
    return m ?? 0;
  },
  MIN: (args) => {
    let m = null;
    for (const v of flatVals(args)) {
      const n = toNumIfNum(v);
      if (n !== null && (m === null || n < m)) m = n;
    }
    return m ?? 0;
  },
  ROUND: (args) => {
    const x = toNum(scalar(args[0]));
    const d = toNum(args[1] !== undefined ? scalar(args[1]) : 0);
    const f = Math.pow(10, Math.trunc(d));
    return Math.round(x * f) / f;
  },
  ABS: (args) => Math.abs(toNum(scalar(args[0]))),
  INT: (args) => Math.trunc(toNum(scalar(args[0]))),
  SQRT: (args) => {
    const n = toNum(scalar(args[0]));
    if (n < 0) throw new EvalError(ERR.VALUE);
    return Math.sqrt(n);
  },
  POWER: (args) => Math.pow(toNum(scalar(args[0])), toNum(scalar(args[1]))),
  MOD: (args) => {
    const x = toNum(scalar(args[0]));
    const y = toNum(scalar(args[1]));
    if (y === 0) throw new EvalError(ERR.DIV0);
    return x - y * Math.trunc(x / y);
  },
  UPPER: (args) => String(scalar(args[0]) ?? "").toUpperCase(),
  LOWER: (args) => String(scalar(args[0]) ?? "").toLowerCase(),
  TRIM: (args) => String(scalar(args[0]) ?? "").trim(),
  LEN: (args) => String(scalar(args[0]) ?? "").length,
  LEFT: (args) => {
    const s = String(scalar(args[0]) ?? "");
    const n = toNum(args[1] !== undefined ? scalar(args[1]) : 1);
    return s.substring(0, Math.max(0, Math.trunc(n)));
  },
  RIGHT: (args) => {
    const s = String(scalar(args[0]) ?? "");
    const n = toNum(args[1] !== undefined ? scalar(args[1]) : 1);
    return s.substring(s.length - Math.max(0, Math.trunc(n)));
  },
  MID: (args) => {
    const s = String(scalar(args[0]) ?? "");
    const start = Math.trunc(toNum(scalar(args[1]))) - 1;
    const len = Math.trunc(toNum(scalar(args[2])));
    return s.substring(Math.max(0, start), Math.max(0, start + len));
  },
  CONCAT: (args) =>
    flatVals(args)
      .filter((v) => v !== null && v !== undefined && String(v) !== "")
      .map((v) => String(v))
      .join(""),
  CONCATENATE: (args) => FUNCS.CONCAT(args),
  IF: (args) => {
    const branch = truthy(scalar(args[0]))
      ? (args[1] !== undefined ? args[1] : true)
      : (args[2] !== undefined ? args[2] : false);
    // Cabang berupa rentang: irisan implisit (satu sel) atau #VALUE!.
    return Array.isArray(branch) ? scalar(branch) : branch;
  },
  IFERROR: (args) => {
    const v = scalar(args[0]);
    if (isErrorValue(v)) return args.length >= 2 ? args[1] : "";
    return v;
  },
  ISERROR: (args) => isErrorValue(scalar(args[0])),
  ISERR: (args) => isErrorValue(scalar(args[0])) && !String(scalar(args[0])).startsWith("#N/A"),
  ISNA: (args) => String(scalar(args[0])).startsWith("#N/A"),
  ISBLANK: (args) => {
    const v = scalar(args[0]);
    return v === null || v === undefined || v === "";
  },
  TEXT: (args) => {
    const v = scalar(args[0]);
    const fmt = String(args.length >= 2 ? scalar(args[1]) : "General");
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return formatCellDateText(v, fmt);
    if (/[dmy]/i.test(fmt) && !/[#0%]/.test(fmt)) {
      const d = asDate(v);
      if (d) return formatCellDateText(d, fmt);
    }
    if (typeof v === "number") {
      return formatCellValue(v, { numFmt: fmt });
    }
    const pn = parseNumberText(v);
    if (pn !== null) return formatCellValue(pn, { numFmt: fmt });
    return String(v);
  },
  AND: (args) => {
    for (const v of flatVals(args)) {
      if (!truthy(v)) return false;
    }
    return true;
  },
  OR: (args) => {
    for (const v of flatVals(args)) {
      if (truthy(v)) return true;
    }
    return false;
  },
  NOT: (args) => !truthy(scalar(args[0])),
  NOW: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  },
  TODAY: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  },
  PI: () => Math.PI,
  MAXA: (args) => {
    let m = null;
    for (const v of flatVals(args)) {
      if (isErrorValue(v)) throw new EvalError(v);
      const n = toNumIfNum(v);
      if (n !== null) {
        if (m === null || n > m) m = n;
      } else if (v !== null && v !== undefined && String(v).trim() !== "") {
        if (m === null || 0 > m) m = 0;
      }
    }
    return m ?? 0;
  },
  MINA: (args) => {
    let m = null;
    for (const v of flatVals(args)) {
      if (isErrorValue(v)) throw new EvalError(v);
      const n = toNumIfNum(v);
      if (n !== null) {
        if (m === null || n < m) m = n;
      } else if (v !== null && v !== undefined && String(v).trim() !== "") {
        if (m === null || 0 < m) m = 0;
      }
    }
    return m ?? 0;
  },
  AVERAGEA: (args) => {
    let s = 0;
    let c = 0;
    for (const v of flatVals(args)) {
      if (isErrorValue(v)) throw new EvalError(v);
      const n = toNumIfNum(v);
      if (n !== null) { s += n; c++; }
      else if (v !== null && v !== undefined && String(v).trim() !== "") { c++; }
    }
    return c ? s / c : 0;
  },
};

function matchCriteria(value, criteria) {
  const s = String(criteria).trim();
  if (s.startsWith(">=")) return toNumIfNum(value) >= toNum(s.slice(2));
  if (s.startsWith("<=")) return toNumIfNum(value) <= toNum(s.slice(2));
  if (s.startsWith("<>")) return String(value ?? "") !== s.slice(2);
  if (s.startsWith(">")) return toNumIfNum(value) > toNum(s.slice(1));
  if (s.startsWith("<")) return toNumIfNum(value) < toNum(s.slice(1));
  if (s.startsWith("=")) return String(value ?? "") === s.slice(1);
  return String(value ?? "").toUpperCase() === s.toUpperCase();
}

// Evaluasi sebuah ekspresi namun TIDAK melempar saat terjadi error — error
// justru DIKEMBALIKAN sebagai nilai string error ("#DIY/0!", dst.). Ini yang
// dipakai untuk argumen pertama fungsi penjaga (IFERROR, ISERROR, ISERR,
// ISNA, ISBLANK): agar mereka bisa melihat hasil hitung yang error sebagai
// "nilai" seperti di Excel, sebelum error ikut merembet ke atas.
const GUARDED_FUNCS = new Set(["IFERROR", "ISERROR", "ISERR", "ISNA", "ISBLANK"]);

function tryEval(node, ctx) {
  try {
    if (node.type === "range") return { ok: true, v: ctx.resolveRangeCells(node.from, node.to) };
    if (node.type === "sheetRange") return { ok: true, v: ctx.resolveSheetRangeCells(node.sheet, node.from, node.to) };
    if (node.type === "fileSheetRef") return { ok: true, v: ctx.resolveFileSheetRef(node.file, node.sheet, node.ref) };
    if (node.type === "fileSheetRange") return { ok: true, v: ctx.resolveFileSheetRangeCells(node.file, node.sheet, node.from, node.to) };
    return { ok: true, v: evaluateAST(node, ctx) };
  } catch (e) {
    const msg =
      e instanceof Error && typeof e.message === "string" && e.message.startsWith("#") ? e.message : ERR.VALUE;
    return { ok: false, v: msg };
  }
}

function applyFunc(name, args, ctx) {
  const fn = FUNCS[name];
  if (!fn) throw new EvalError(ERR.NAME);
  // PENTING: argumen rentang (range/sheetRange/fileSheetRange) diteruskan
  // sebagai ARRAY agar fungsi bersyarat (COUNTIF/SUMIF/COUNTIFS/SUMIFS/
  // AVERAGEIF) menerima batas rentangnya. Fungsi agregat sederhana
  // membentangkan sendiri via flatVals; fungsi skalar memakai scalar().
  const resolveArg = (a) => {
    if (a.type === "range") return ctx.resolveRangeCells(a.from, a.to);
    if (a.type === "sheetRange") return ctx.resolveSheetRangeCells(a.sheet, a.from, a.to);
    if (a.type === "fileSheetRange") return ctx.resolveFileSheetRangeCells(a.file, a.sheet, a.from, a.to);
    return evaluateAST(a, ctx);
  };
  if (GUARDED_FUNCS.has(name) && args.length > 0) {
    const first = tryEval(args[0], ctx);
    return fn([first.v, ...args.slice(1).map(resolveArg)]);
  }
  return fn(args.map(resolveArg));
}

function evaluateAST(node, ctx) {
  switch (node.type) {
    case "lit":
      return node.value;
    case "ref":
      return ctx.resolveRef(node.ref);
    case "sheetRef":
      return ctx.resolveSheetRef(node.sheet, node.ref);
    case "sheetRange":
      throw new EvalError(ERR.VALUE);
    case "fileSheetRef":
      return ctx.resolveFileSheetRef(node.file, node.sheet, node.ref);
    case "fileSheetRange":
      throw new EvalError(ERR.VALUE);
    case "range":
      throw new EvalError(ERR.VALUE);
    case "neg":
      return -toNum(evaluateAST(node.operand, ctx));
    case "pos":
      return toNum(evaluateAST(node.operand, ctx));
    case "bin":
      return applyBin(node.op, evaluateAST(node.left, ctx), evaluateAST(node.right, ctx));
    case "func":
      return applyFunc(node.name, node.args, ctx);
  }
  throw new EvalError(ERR.VALUE);
}

// ============ evaluasi seluruh grid ============

function buildColMaps(columns) {
  const colKeyByLetter = {};
  const colIdxByKey = {};
  columns.forEach((c, i) => {
    colKeyByLetter[colName(i)] = c.key;
    colIdxByKey[c.key] = i;
  });
  return { colKeyByLetter, colIdxByKey };
}

// ============ evaluasi seluruh grid & workbook eksternal ============

// Resolver nilai sel untuk sebuah WORKBOOK eksternal (referensi antar-file).
// Membaca workbook SheetJS apa adanya: sel statis memakai .v; sel ber-rumus
// (.f) dievaluasi ulang dengan engine ini sehingga nilainya selalu segar.
// externalHook dipakai saat rumus di file eksternal malah merujuk ke file lain
// (referensi antar-file bersarang). Nilai gagal dikembalikan sebagai STRING
// error (dimulai "#") agar langsung bisa ditampilkan grid.
export function createWorkbookResolver(workbook, externalHook) {
  const sheetMap = {};
  for (const name of workbook && Array.isArray(workbook.SheetNames) ? workbook.SheetNames : []) {
    sheetMap[name.toUpperCase()] = workbook.Sheets[name];
  }
  const hook = typeof externalHook === "function" ? externalHook : () => null;
  const cache = new Map();
  const resolving = new Set();

  function parseRefOrThrow(ref) {
    const p = parseRef(ref);
    if (!p) throw new EvalError(ERR.REF);
    return p;
  }

  function makeCtx(sheetKey, currentRow) {
    return {
      resolveRef(ref) {
        return computeSheetRef(sheetKey, ref, currentRow);
      },
      resolveSheetRef(sheetName, ref) {
        return computeSheetRef(sheetName, ref, currentRow);
      },
      resolveRangeCells(from, to) {
        const p1 = parseRefOrThrow(from);
        const p2 = parseRefOrThrow(to);
        const r1 = Math.min(p1.row ?? currentRow, p2.row ?? currentRow);
        const r2 = Math.max(p1.row ?? currentRow, p2.row ?? currentRow);
        const c1 = Math.min(p1.col, p2.col);
        const c2 = Math.max(p1.col, p2.col);
        const out = [];
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            out.push(computeSheetRef(sheetKey, `${colName(c)}${r + 1}`, currentRow));
          }
        }
        return out;
      },
      resolveSheetRangeCells(sheetName, from, to) {
        const p1 = parseRefOrThrow(from);
        const p2 = parseRefOrThrow(to);
        const r1 = Math.min(p1.row ?? 0, p2.row ?? 0);
        const r2 = Math.max(p1.row ?? 0, p2.row ?? 0);
        const c1 = Math.min(p1.col, p2.col);
        const c2 = Math.max(p1.col, p2.col);
        const out = [];
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            out.push(computeSheetRef(sheetName, `${colName(c)}${r + 1}`, currentRow));
          }
        }
        return out;
      },
      resolveFileSheetRef(fileName, sheetName, ref) {
        const ext = hook(normalizeFileKey(fileName));
        if (!ext) throw new EvalError(ERR.REF_FILE);
        const v = ext.getValue(sheetName, ref);
        return v === undefined ? null : v;
      },
      resolveFileSheetRangeCells(fileName, sheetName, from, to) {
        const ext = hook(normalizeFileKey(fileName));
        if (!ext) throw new EvalError(ERR.REF_FILE);
        const vals = ext.getRange(sheetName, from, to);
        return Array.isArray(vals) ? vals : [];
      },
    };
  }

  function computeSheetRef(sheetName, ref, currentRow) {
    const p = parseRefOrThrow(ref);
    const r = p.row !== null ? p.row : (currentRow || 0);
    if (r < 0 || p.col < 0) throw new EvalError(ERR.REF);
    const addr = `${colName(p.col)}${r + 1}`;
    const skey = (sheetName || "").toUpperCase();
    const ckey = `${skey}\x1f${addr}`;
    if (cache.has(ckey)) return cache.get(ckey);
    const ws = sheetMap[skey];
    if (!ws) throw new EvalError(ERR.REF);
    const cell = ws[addr];
    if (!cell) return null;
    let value;
    if (typeof cell.f === "string" && cell.f.trim() !== "") {
      if (resolving.has(ckey)) return ERR.CYCLE;
      resolving.add(ckey);
      try {
        const ast = new Parser(tokenize(cell.f.trim().replace(/^=/, ""))).parseExpr();
        value = evaluateAST(ast, makeCtx(skey, r));
      } catch (e) {
        value = e instanceof EvalError ? e.message : ERR.ERR;
      }
      resolving.delete(ckey);
    } else {
      value = cell.v !== undefined ? cell.v : null;
    }
    cache.set(ckey, value);
    return value;
  }

  return {
    getValue(sheetName, ref) {
      try {
        return computeSheetRef(sheetName, ref, 0);
      } catch (e) {
        return e instanceof EvalError ? e.message : ERR.ERR;
      }
    },
    getRange(sheetName, from, to) {
      const p1 = parseRef(from);
      const p2 = parseRef(to);
      if (!p1 || !p2) return [];
      const r1 = Math.min(p1.row ?? 0, p2.row ?? 0);
      const r2 = Math.max(p1.row ?? 0, p2.row ?? 0);
      const c1 = Math.min(p1.col, p2.col);
      const c2 = Math.max(p1.col, p2.col);
      const out = [];
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          try {
            out.push(computeSheetRef(sheetName, `${colName(c)}${r + 1}`, r));
          } catch (e) {
            out.push(e instanceof EvalError ? e.message : ERR.ERR);
          }
        }
      }
      return out;
    },
  };
}

// Hook eksternal yang DIMEMO bagi resolver per kunci file. Satu workbook yang
// sama memakai satu instance resolver + set "resolving" yang sama, sehingga
// referensi antar-file yang melingkar (A->B->A) terdeteksi sebagai #CYCLE!
// dan bukan stack overflow.
export function createExternalResolverHook(workbookByKey) {
  const memo = new Map();
  let hook;
  hook = (fileKey) => {
    const k = normalizeFileKey(fileKey);
    if (memo.has(k)) {
      const hit = memo.get(k);
      return hit === null ? null : hit;
    }
    const wb = workbookByKey.get(k);
    if (!wb) return null;
    const resolver = createWorkbookResolver(wb, (k2) => hook(k2));
    memo.set(k, resolver);
    return resolver;
  };
  return hook;
}

export function evaluateGrid(grid, columns, allSheets, currentSheetName, opts) {
  const { colKeyByLetter } = buildColMaps(columns);
  const rowCount = grid.length;
  const cache = new Map();
  const resolving = new Set();
  const fileSheets = (opts && opts.fileSheets) || null;
  const extHook = opts && typeof opts.external === "function" ? opts.external : null;

  function rawAt(rowIdx, colIdx, sheetRows, sheetColKeyByLetter) {
    const sRows = sheetRows || grid;
    const sMap = sheetColKeyByLetter || colKeyByLetter;
    if (rowIdx < 0 || rowIdx >= sRows.length) return null;
    const key = sMap[colName(colIdx)];
    if (!key) return null;
    return sRows[rowIdx] ? sRows[rowIdx][key] : null;
  }

  function computeCell(rowIdx, colIdx, fileKey, sheetKey, sheetRows, sheetColKeyByLetter, sheetMap) {
    const fKey = fileKey || "_self";
    const sKey = sheetKey || currentSheetName || "_local_";
    const sRows = sheetRows || grid;
    const sMap = sheetColKeyByLetter || colKeyByLetter;
    const key = sMap[colName(colIdx)];
    if (!key) return { value: "#REF!" };
    const ckey = `${fKey}\x1f${sKey}:${rowIdx}:${key}`;
    if (cache.has(ckey)) return cache.get(ckey);
    const raw = rawAt(rowIdx, colIdx, sRows, sMap);
    if (typeof raw !== "string" || !raw.trim().startsWith("=")) {
      const v = { value: raw === undefined ? null : raw };
      cache.set(ckey, v);
      return v;
    }
    if (resolving.has(ckey)) {
      const v = { value: ERR.CYCLE, formula: true };
      cache.set(ckey, v);
      return v;
    }
    resolving.add(ckey);
    const expr = raw.trim().slice(1);
    let value;
    try {
      const ast = new Parser(tokenize(expr)).parseExpr();
      const ctx = makeCtx(rowIdx, fKey, sKey, sRows, sMap, sheetMap);
      value = evaluateAST(ast, ctx);
    } catch (e) {
      value = e instanceof EvalError ? e.message : ERR.ERR;
    }
    resolving.delete(ckey);
    const v = { value, formula: true };
    cache.set(ckey, v);
    return v;
  }

  function makeCtx(currentRow, fileKey, sheetKey, sheetRows, sheetColKeyByLetter, sheetMap) {
    const fKey = fileKey || "_self";
    const sRows = sheetRows || grid;
    const sMap = sheetColKeyByLetter || colKeyByLetter;
    const sMapAll = sheetMap || allSheets;

    return {
      resolveRef(ref) {
        const p = parseRef(ref);
        if (!p) throw new EvalError(ERR.REF);
        const r = p.row !== null ? p.row : currentRow;
        return computeCell(r, p.col, fKey, sheetKey, sRows, sMap, sMapAll).value;
      },
      resolveSheetRef(sheetName, ref) {
        const sn = sheetName.toUpperCase();
        if (!sMapAll || !sMapAll[sn]) throw new EvalError(ERR.REF);
        const target = sMapAll[sn];
        const { colKeyByLetter: tMap } = buildColMaps(target.columns);
        const p = parseRef(ref);
        if (!p) throw new EvalError(ERR.REF);
        const r = p.row !== null ? p.row : currentRow;
        return computeCell(r, p.col, fKey, sn, target.rows, tMap, sMapAll).value;
      },
      resolveRangeCells(from, to) {
        const p1 = parseRef(from);
        const p2 = parseRef(to);
        if (!p1 || !p2) throw new EvalError(ERR.REF);
        const r1 = Math.min(p1.row ?? currentRow, p2.row ?? currentRow);
        const r2 = Math.max(p1.row ?? currentRow, p2.row ?? currentRow);
        const c1 = Math.min(p1.col, p2.col);
        const c2 = Math.max(p1.col, p2.col);
        const out = [];
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            out.push(computeCell(r, c, fKey, sheetKey, sRows, sMap, sMapAll).value);
          }
        }
        return out;
      },
      resolveSheetRangeCells(sheetName, from, to) {
        const sn = sheetName.toUpperCase();
        if (!sMapAll || !sMapAll[sn]) throw new EvalError(ERR.REF);
        const target = sMapAll[sn];
        const { colKeyByLetter: tMap } = buildColMaps(target.columns);
        const p1 = parseRef(from);
        const p2 = parseRef(to);
        if (!p1 || !p2) throw new EvalError(ERR.REF);
        const r1 = Math.min(p1.row ?? 0, p2.row ?? 0);
        const r2 = Math.max(p1.row ?? 0, p2.row ?? 0);
        const c1 = Math.min(p1.col, p2.col);
        const c2 = Math.max(p1.col, p2.col);
        const out = [];
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            out.push(computeCell(r, c, fKey, sn, target.rows, tMap, sMapAll).value);
          }
        }
        return out;
      },
      resolveFileSheetRef(fileName, sheetName, ref) {
        const fK = normalizeFileKey(fileName);
        const sn = sheetName.toUpperCase();
        const fMap = fileSheets ? fileSheets[fK] : null;
        const target = fMap ? fMap[sn] : null;
        if (target) {
          const { colKeyByLetter: tMap } = buildColMaps(target.columns);
          const p = parseRef(ref);
          if (!p) throw new EvalError(ERR.REF);
          const r = p.row !== null ? p.row : currentRow;
          return computeCell(r, p.col, fK, sn, target.rows, tMap, fMap).value;
        }
        if (!extHook) throw new EvalError(ERR.REF_FILE);
        const ext = extHook(fK);
        if (!ext) throw new EvalError(ERR.REF_FILE);
        const v = ext.getValue(sn, ref);
        return v === undefined ? null : v;
      },
      resolveFileSheetRangeCells(fileName, sheetName, from, to) {
        const fK = normalizeFileKey(fileName);
        const sn = sheetName.toUpperCase();
        const fMap = fileSheets ? fileSheets[fK] : null;
        const target = fMap ? fMap[sn] : null;
        if (target) {
          const { colKeyByLetter: tMap } = buildColMaps(target.columns);
          const p1 = parseRef(from);
          const p2 = parseRef(to);
          if (!p1 || !p2) throw new EvalError(ERR.REF);
          const r1 = Math.min(p1.row ?? 0, p2.row ?? 0);
          const r2 = Math.max(p1.row ?? 0, p2.row ?? 0);
          const c1 = Math.min(p1.col, p2.col);
          const c2 = Math.max(p1.col, p2.col);
          const out = [];
          for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
              out.push(computeCell(r, c, fK, sn, target.rows, tMap, fMap).value);
            }
          }
          return out;
        }
        if (!extHook) throw new EvalError(ERR.REF_FILE);
        const ext = extHook(fK);
        if (!ext) throw new EvalError(ERR.REF_FILE);
        const vals = ext.getRange(sn, from, to);
        return Array.isArray(vals) ? vals : [];
      },
    };
  }

  const result = new Map();
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columns.length; c++) {
      const key = colKeyByLetter[colName(c)];
      result.set(`${r}:${key}`, computeCell(r, c).value);
    }
  }
  return result;
}

export function getCellValue(computed, grid, r, key) {
  const k = `${r}:${key}`;
  if (computed.has(k)) return computed.get(k);
  return grid[r] ? grid[r][key] : null;
}

// ============ format & normalisasi sel ============

function formatCellDateText(d, fmt) {
  const p = (x) => String(x).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const monthsFull = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  let out = fmt;
  out = out.replace(/mmmm/g, monthsFull[d.getMonth()]);
  out = out.replace(/mmm/g, months[d.getMonth()]);
  out = out.replace(/dddd/g, days[d.getDay()]);
  out = out.replace(/ddd/g, days[d.getDay()].slice(0, 3));
  out = out.replace(/yyyy/g, String(d.getFullYear()));
  out = out.replace(/yy/g, String(d.getFullYear()).slice(-2));
  if (/[hH]/.test(out)) {
    out = out.replace(/hh/g, p(d.getHours())).replace(/h/g, String(d.getHours()));
    out = out.replace(/mm/g, p(d.getMinutes()));
    out = out.replace(/ss/g, p(d.getSeconds()));
    out = out.replace(/AM\/PM/gi, "");
  } else {
    out = out.replace(/mm/g, p(d.getMonth() + 1));
    out = out.replace(/m/g, String(d.getMonth() + 1));
  }
  out = out.replace(/dd/g, p(d.getDate()));
  out = out.replace(/d/g, String(d.getDate()));
  return out;
}

export function formatCellValue(value, col) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  col = col || {};
  if (typeof value === "number") {
    const fmt = typeof col.numFmt === "string" ? col.numFmt : "";
    if (col.format === "rupiah" || /rp|rupiah|idr/i.test(fmt)) return formatRupiah(value);
    // Format kurung "(0)" / "(#,##0.00)": Excel menampilkan bilangan (termasuk
    // negatif) di dalam tanda kurung tanpa tanda minus — (1), (2), (3), dst.
    const posPart = (fmt.split(";")[0] || fmt).replace(/\[[^\]]*\]/g, "").trim();
    const open = posPart.indexOf("(");
    const close = posPart.indexOf(")", open + 1);
    if (open >= 0 && close > open) {
      const dec = countDecimals(posPart);
      const grouped = posPart.indexOf(",") >= 0;
      const mag = Math.abs(value).toLocaleString(grouped ? "id-ID" : "en-US", {
        useGrouping: grouped,
        maximumFractionDigits: dec,
        minimumFractionDigits: dec,
      });
      const inner = posPart
        .slice(open + 1, close)
        .replace(/\\/g, "")
        .replace(/[0#][0#.,\s]*/, mag)
        .trim();
      return `(${inner})`;
    }
    // Format akuntansi "; (..)": bagian kedua (negatif) dalam kurung.
    if (value < 0 && fmt.indexOf(";") >= 0) {
      const negPart = fmt.split(";")[1];
      if (negPart && negPart.indexOf("(") >= 0) {
        const cleaned = negPart.replace(/\[[^\]]*\]/g, "").trim();
        const open = cleaned.indexOf("(");
        const close = cleaned.indexOf(")", open + 1);
        if (open >= 0 && close > open) {
          const posPart = fmt.split(";")[0] || fmt;
          const dec = countDecimals(posPart);
          const grouped = posPart.indexOf(",") >= 0;
          const mag = Math.abs(value).toLocaleString(grouped ? "id-ID" : "en-US", {
            useGrouping: grouped,
            maximumFractionDigits: dec,
            minimumFractionDigits: dec,
          });
          const inner = cleaned
            .slice(open + 1, close)
            .replace(/\\/g, "")
            .replace(/[0#][0#.,\s]*/, mag)
            .trim();
          return `(${inner})`;
        }
      }
    }
    if (fmt.indexOf("%") >= 0) {
      const dec = countDecimals(fmt);
      const grouped = fmt.indexOf(",") >= 0;
      return `${(value * 100).toLocaleString(grouped ? "id-ID" : "en-US", { useGrouping: grouped, maximumFractionDigits: dec, minimumFractionDigits: dec })}%`;
    }
    if (fmt && /[#0]/.test(fmt)) {
      const dec = countDecimals(fmt);
      const grouped = fmt.indexOf(",") >= 0;
      // Pengelompokan ribuan HANYA bila format menyatakannya (mis. "#,##0").
      // Akhiran format tanpa koma (mis. "General", "0", "0.00") tidak memisah
      // ribuan — persis seperti Excel yang menampilkan 2008 sebagai "2008",
      // bukan "2.008". Separator desimal memakai lokal UI (id-ID).
      const opts = { useGrouping: grouped, maximumFractionDigits: dec, minimumFractionDigits: dec };
      return value.toLocaleString(grouped ? "id-ID" : "en-US", opts);
    }
    return value.toLocaleString("id-ID", { useGrouping: false });
  }
  if (value instanceof Date) {
    const fmt = typeof col.numFmt === "string" ? col.numFmt : "";
    // Hapus prefiks lokasi "[$-409]" dll. — hanya token format yang dipakai.
    const clean = fmt.replace(/\[[^\]]*\]/g, "").trim();
    const hasTokens = clean.length > 0 && /[dmyhHsS]/.test(clean);
    if (hasTokens) {
      // Mesin format tanggal presisi: "dd-mmm-yyyy" → 31-Des-2008,
      // "yyyy" → 2008, "hh:mm" → 09:05, dst. Waktu hanya dipilih bila format
      // benar-benar memakai jam (h/H) — bukan "mm" yang merupakan bulan.
      return formatCellDateText(value, clean);
    }
    const p = (x) => String(x).padStart(2, "0");
    return `${p(value.getDate())}/${p(value.getMonth() + 1)}/${value.getFullYear()}`;
  }
  const s = String(value);
  if (s.startsWith("#")) return s;
  if (col.options) {
    const o = col.options.find((x) => String(x.value) === s);
    if (o) return o.label;
  }
  return s;
}

function countDecimals(fmt) {
  const i = fmt.indexOf(".");
  if (i < 0) return 0;
  let n = 0;
  for (let j = i + 1; j < fmt.length && /[0#]/.test(fmt[j]); j++) n++;
  return n;
}

function parseNumberText(t) {
  let s = String(t || "").trim();
  if (s === "") return null;
  s = s.replace(/[Rp\s]/gi, "");
  if (s === "") return null;
  if (!/^[0-9.,+-]+$/.test(s)) return null;
  // Indonesian: titik = pemisah ribuan, koma = desimal.
  // Titik dianggap ribuan bila diikuti tepat 3 digit.
  if (/\.\d{3}(\D|$)/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCell(col, text) {
  const raw = text ?? "";
  const t = String(raw).trim();
  if (t.startsWith("=")) return t;
  if (col.type === "number") {
    const n = parseNumberText(t);
    return n !== null ? n : t;
  }
  return raw;
}

// ============ definisi kolom spreadsheet ============

export const STANDARD_KEYS = [
  "kode",
  "nama",
  "kategori_id",
  "jumlah",
  "harga",
  "total",
  "tanggal",
  "status",
  "keterangan",
];

const STATUS_OPTIONS = [
  { value: "Masuk", label: "Masuk" },
  { value: "Keluar", label: "Keluar" },
  { value: "Pending", label: "Pending" },
];

const DEFAULT_COLUMNS = [
  { key: "kode", label: "Kode", type: "text", width: 110 },
  { key: "nama", label: "Nama", type: "text", width: 200 },
  { key: "kategori_id", label: "Kategori", type: "select", width: 130 },
  { key: "jumlah", label: "Jumlah", type: "number", width: 100 },
  { key: "harga", label: "Harga", type: "number", width: 130, format: "rupiah" },
  { key: "total", label: "Total", type: "number", width: 150, format: "rupiah" },
  { key: "tanggal", label: "Tanggal", type: "date", width: 130 },
  { key: "status", label: "Status", type: "select", width: 120, options: STATUS_OPTIONS },
  { key: "keterangan", label: "Keterangan", type: "text", width: 240 },
];

export function defaultColumns(kategoriOptions) {
  return DEFAULT_COLUMNS.map((c) =>
    c.key === "kategori_id"
      ? { ...c, options: [{ value: "", label: "(kosong)" }, ...(kategoriOptions || [])] }
      : { ...c }
  );
}

export function buildColumns(kategoriOptions, kolom) {
  const base = defaultColumns(kategoriOptions);
  if (!Array.isArray(kolom) || kolom.length === 0) return base;
  const byKey = Object.fromEntries(base.map((c) => [c.key, c]));
  const out = [];
  for (const cfg of kolom) {
    if (!cfg || cfg.visible === false) continue;
    const b = byKey[cfg.key];
    if (b) {
      out.push({ ...b, label: cfg.label || b.label, width: cfg.width || b.width });
    } else {
      out.push({
        key: cfg.key,
        label: cfg.label || cfg.key,
        type: cfg.type || "text",
        width: cfg.width || 140,
      });
    }
  }
  return out.length ? out : base;
}

export function defaultGridRow(columns = DEFAULT_COLUMNS) {
  const row = {};
  for (const c of columns) {
    if (c.key === "kategori_id" || c.key === "sub_kategori_id") {
      row[c.key] = "";
    } else if (c.key === "status") {
      row[c.key] = "";
    } else if (c.type === "number") {
      row[c.key] = null;
    } else if (c.type === "select" && c.options && c.options.length > 0) {
      row[c.key] = "";
    } else {
      row[c.key] = "";
    }
  }
  return row;
}

export function gridRowFromDb(d, columns = DEFAULT_COLUMNS) {
  let fm = {};
  if (d.formulas) {
    if (typeof d.formulas === "string") {
      try {
        fm = JSON.parse(d.formulas);
      } catch (_) {
        fm = {};
      }
    } else {
      fm = d.formulas;
    }
  }
  let nilai = {};
  if (d.nilai) {
    if (typeof d.nilai === "string") {
      try {
        nilai = JSON.parse(d.nilai);
      } catch (_) {
        nilai = {};
      }
    } else {
      nilai = d.nilai;
    }
  }
  const row = {
    id: d.id,
    kode: fm.kode ?? d.kode ?? "",
    nama: fm.nama ?? d.nama ?? "",
    kategori_id: fm.kategori_id ?? (d.kategori_id ?? ""),
    jumlah: fm.jumlah ?? d.jumlah ?? null,
    harga: fm.harga ?? d.harga ?? null,
    tanggal: fm.tanggal ?? (d.tanggal ? String(d.tanggal).slice(0, 10) : ""),
    status: fm.status ?? d.status ?? "Pending",
    keterangan: fm.keterangan ?? (d.keterangan ?? ""),
  };
  const j = columns.findIndex((c) => c.key === "jumlah");
  const h = columns.findIndex((c) => c.key === "harga");
  const hasTotalCol = columns.some((c) => c.key === "total");
  row.total = hasTotalCol
    ? fm.total ?? (j >= 0 && h >= 0 ? `=${colName(j)}*${colName(h)}` : null)
    : null;
  for (const c of columns) {
    if (!(c.key in row)) {
      const v = fm[c.key] ?? nilai[c.key];
      row[c.key] = v === undefined || v === null ? (c.type === "number" ? null : "") : v;
    }
  }
  return row;
}

export function collectFormulas(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && v.trim().startsWith("=")) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}
