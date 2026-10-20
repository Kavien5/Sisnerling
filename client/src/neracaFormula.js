const SECTION_PREFIX = { f: "physical", r: "rent", m: "monetary", p: "data_penunjang" };
const SECTION_PREFIX_REVERSE = { physical: "f", rent: "r", monetary: "m", data_penunjang: "p" };
const SECTION_LABEL = {
  physical: "Neraca Fisik",
  rent: "Unit Rent",
  monetary: "Neraca Moneter",
  data_penunjang: "Data Penunjang",
};
const SHEET_ALIAS = {
  jj: "Jati Jawa",
  rj: "Rimba Jawa",
  rlj: "Rimba Luar Jawa",
  ind: "Indonesia",
  dp: "Data Penunjang",
};
const SHEET_ALIAS_BY_NAME = {
  "jati jawa": "jj",
  "rimba jawa": "rj",
  "rimba luar jawa": "rlj",
  indonesia: "ind",
  "data penunjang": "dp",
};
const KNOWN_SHEETS = Object.keys(SHEET_ALIAS_BY_NAME);
const FUNCS = {
  ROUND: (a, n) => {
    const d = Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
    const f = Math.pow(10, d);
    return Math.round(Number(a) * f) / f;
  },
  ABS: (a) => Math.abs(Number(a)),
  MIN: (...xs) => Math.min(...xs.map(Number)),
  MAX: (...xs) => Math.max(...xs.map(Number)),
  SUM: (...xs) => xs.reduce((s, x) => s + Number(x), 0),
  AVG: (...xs) => (xs.length ? xs.reduce((s, x) => s + Number(x), 0) / xs.length : 0),
  IF: (c, a, b) => (truthy(c) ? Number(a) : Number(b)),
  AND: (...xs) => (xs.length && xs.every(truthy) ? 1 : 0),
  OR: (...xs) => (xs.some(truthy) ? 1 : 0),
};

function formulaError(message, pos) {
  const err = new Error(message);
  err.formulaPos = typeof pos === "number" ? pos : null;
  return err;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function truthy(v) {
  return toNum(v) !== 0;
}

function tokenize(src) {
  const s = String(src == null ? "" : src);
  const toks = [];
  let i = 0;
  const isDigit = (c) => c >= "0" && c <= "9";
  const isIdentStart = (c) => /[A-Za-z_]/.test(c);
  const isIdent = (c) => /[A-Za-z0-9_]/.test(c);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(s[i + 1]))) {
      let j = i;
      let dots = 0;
      let digits = 0;
      while (j < s.length && (isDigit(s[j]) || s[j] === ".")) {
        if (s[j] === ".") dots += 1;
        else digits += 1;
        j += 1;
      }
      const raw = s.slice(i, j);
      if (dots > 1 || digits === 0) throw formulaError(`Angka tidak valid "${raw}"`, i);
      toks.push({ t: "num", v: parseFloat(raw), p: i });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let out = "";
      while (j < s.length && s[j] !== quote) {
        out += s[j];
        j += 1;
      }
      if (j >= s.length) throw formulaError("Tanda kutip nama sheet tidak ditutup", i);
      toks.push({ t: "str", v: out, p: i });
      i = j + 1;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < s.length && isIdent(s[j])) j += 1;
      toks.push({ t: "id", v: s.slice(i, j), p: i });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (["<=", ">=", "<>", "==", "!=", "&&", "||"].includes(two)) {
      toks.push({ t: "op", v: two, p: i });
      i += 2;
      continue;
    }
    if ("+-*/^()[]{},;=<>".includes(c)) {
      toks.push({ t: c, v: c, p: i });
      i += 1;
      continue;
    }
    throw formulaError(`Karakter tidak dikenal "${c}" di dalam rumus`, i);
  }
  toks.push({ t: "eof", v: "", p: s.length });
  return toks;
}

function parseFormula(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const at = (t, v) => {
    const k = toks[p];
    return !!k && k.t === t && (v === undefined || k.v === v);
  };
  const atId = (word) => {
    const k = toks[p];
    return !!k && k.t === "id" && k.v.toUpperCase() === word;
  };
  const take = () => toks[p++];
  const unexpected = () => {
    const k = peek();
    const shown = k && k.t !== "eof" ? ` "${k.v}"` : "";
    return formulaError(`Rumus tidak valid: token tak terduga${shown}`, k ? k.p : 0);
  };
  const expect = (t, v, msg) => {
    if (!at(t, v)) throw formulaError(msg || `Rumus tidak valid: token tak terduga "${peek().v}"`, peek().p);
    return take();
  };

  function parseOr() {
    let l = parseAnd();
    while (at("op", "||") || atId("OR")) {
      take();
      l = { t: "or", l, r: parseAnd() };
    }
    return l;
  }
  function parseAnd() {
    let l = parseCmp();
    while (at("op", "&&") || atId("AND")) {
      take();
      l = { t: "and", l, r: parseCmp() };
    }
    return l;
  }
  function parseCmp() {
    let l = parseAdd();
    for (;;) {
      if (at("op", "==") || at("op", "!=") || at("op", "<>") || at("=") || at("<") || at(">") || at("op", "<=") || at("op", ">=")) {
        const k = take();
        l = { t: "cmp", op: k.v, l, r: parseAdd() };
      } else break;
    }
    return l;
  }
  function parseAdd() {
    let l = parseMul();
    while (at("+") || at("-")) {
      const k = take();
      l = { t: "bin", op: k.v, l, r: parseMul() };
    }
    return l;
  }
  function parseMul() {
    let l = parseUnary();
    while (at("*") || at("/")) {
      const k = take();
      l = { t: "bin", op: k.v, l, r: parseUnary() };
    }
    return l;
  }
  function parseUnary() {
    if (at("-")) {
      take();
      return { t: "un", op: "-", x: parseUnary() };
    }
    if (at("+")) {
      take();
      return parseUnary();
    }
    return parsePower();
  }
  function parsePower() {
    const base = parsePrimary();
    if (at("^")) {
      take();
      return { t: "bin", op: "^", l: base, r: parseUnary() };
    }
    return base;
  }
  function parseRefFrom(segs) {
    while (at(".")) {
      take();
      if (at("id")) segs.push({ kind: "id", v: take().v });
      else if (at("str")) segs.push({ kind: "str", v: take().v });
      else throw unexpected();
    }
    let abs = null;
    let rel = null;
    if (at("[")) {
      take();
      let sign = 0;
      if (at("+") || at("-")) {
        const k = take();
        sign = k.v === "-" ? -1 : 1;
      }
      if (!at("num")) throw formulaError("Tahun di dalam [ ] harus berupa angka", peek().p);
      const numTok = take();
      if (!Number.isInteger(numTok.v)) throw formulaError("Tahun harus bilangan bulat", numTok.p);
      expect("]", undefined, 'Tutup tanda ] tahun tidak ditemukan');
      if (sign === 0) abs = String(numTok.v);
      else rel = sign * numTok.v;
    }
    let sheet = null;
    let section;
    let row;
    if (segs.length === 2) {
      const key = String(segs[0].v).toLowerCase();
      if (!SECTION_PREFIX[key]) throw formulaError('Gunakan awalan f. (fisik), r. (unit rent), m. (moneter), atau p. (parameter)', segs[0].p);
      section = SECTION_PREFIX[key];
      row = segs[1].v;
    } else if (segs.length === 3) {
      sheet = resolveSheetSeg(segs[0]);
      const key = String(segs[1].v).toLowerCase();
      if (!SECTION_PREFIX[key]) throw formulaError('Gunakan awalan f. (fisik), r. (unit rent), m. (moneter), atau p. (parameter)', segs[1].p);
      section = SECTION_PREFIX[key];
      row = segs[2].v;
    } else {
      throw formulaError("Format referensi: [sheet.]f|m|r|p.baris[tahun]", segs[0].p);
    }
    if (section === "data_penunjang") {
      if (sheet && sheet !== "Data Penunjang") throw formulaError("Data Penunjang hanya dapat dirujuk lewat p.<id_parameter>", segs[0].p);
      sheet = "Data Penunjang";
    }
    return { t: "ref", sheet, section, row, year: abs, rel };
  }
  function resolveSheetSeg(seg) {
    if (seg.kind === "str") {
      const name = String(seg.v).trim().toLowerCase();
      if (KNOWN_SHEETS.includes(name)) {
        const full = KNOWN_SHEETS.find((k) => k === name);
        return SHEET_ALIAS_BY_NAME[full];
      }
      throw formulaError(`Sheet "${seg.v}" tidak dikenal`, seg.p);
    }
    const alias = SHEET_ALIAS[String(seg.v).toLowerCase()];
    if (!alias) throw formulaError(`Sheet "${seg.v}" tidak dikenal (pakai jj, rj, rlj, ind, dp)`, seg.p);
    return alias;
  }
  function parsePrimary() {
    if (at("num")) return { t: "num", v: take().v };
    if (at("(")) {
      take();
      const e = parseOr();
      expect(")", undefined, "Tutup kurung ) tidak ditemukan");
      return e;
    }
    if (at("id")) {
      const first = take();
      if (at("(")) {
        take();
        const args = [];
        if (!at(")")) {
          args.push(parseOr());
          while (at(",") || at(";")) {
            take();
            args.push(parseOr());
          }
        }
        expect(")", undefined, "Tutup kurung ) fungsi tidak ditemukan");
        return { t: "call", name: first.v.toUpperCase(), args };
      }
      return parseRefFrom([{ kind: "id", v: first.v, p: first.p }]);
    }
    if (at("str")) {
      const k = take();
      return parseRefFrom([{ kind: "str", v: k.v, p: k.p }]);
    }
    throw unexpected();
  }

  const ast = parseOr();
  if (!at("eof")) throw formulaError(`Rumus tidak valid: token berlebihan "${peek().v}"`, peek().p);
  return ast;
}

function resolveYear(node, ctx) {
  if (node.year != null) return String(node.year);
  if (node.rel != null) {
    const base = ctx && ctx.year != null ? parseInt(String(ctx.year), 10) : NaN;
    if (Number.isNaN(base)) throw formulaError("Tahun sel asal tidak diketahui untuk referensi [-1]/[+1]");
    return String(base + node.rel);
  }
  if (!ctx || ctx.year == null) throw formulaError("Tahun sel asal tidak diketahui untuk referensi tanpa [tahun]");
  return String(ctx.year);
}

function evalAst(node, ctx) {
  switch (node.t) {
    case "num":
      return node.v;
    case "un": {
      const v = toNum(evalAst(node.x, ctx));
      return node.op === "-" ? -v : v;
    }
    case "bin": {
      const a = toNum(evalAst(node.l, ctx));
      const b = toNum(evalAst(node.r, ctx));
      if (node.op === "+") return a + b;
      if (node.op === "-") return a - b;
      if (node.op === "*") return a * b;
      if (node.op === "/") return b === 0 ? 0 : a / b;
      if (node.op === "^") return Math.pow(a, b);
      throw formulaError(`Operator "${node.op}" tidak dikenal`);
    }
    case "cmp": {
      const a = toNum(evalAst(node.l, ctx));
      const b = toNum(evalAst(node.r, ctx));
      switch (node.op) {
        case "=":
        case "==":
          return a === b ? 1 : 0;
        case "<>":
        case "!=":
          return a !== b ? 1 : 0;
        case "<":
          return a < b ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        case "<=":
          return a <= b ? 1 : 0;
        case ">=":
          return a >= b ? 1 : 0;
        default:
          throw formulaError(`Operator perbandingan "${node.op}" tidak dikenal`);
      }
    }
    case "and":
      return truthy(evalAst(node.l, ctx)) && truthy(evalAst(node.r, ctx)) ? 1 : 0;
    case "or":
      return truthy(evalAst(node.l, ctx)) || truthy(evalAst(node.r, ctx)) ? 1 : 0;
    case "cond":
      return truthy(evalAst(node.c, ctx)) ? evalAst(node.a, ctx) : evalAst(node.b, ctx);
    case "call": {
      const fn = FUNCS[node.name];
      if (!fn) throw formulaError(`Fungsi "${node.name}" tidak dikenal (tersedia: ${Object.keys(FUNCS).join(", ")})`);
      const args = node.args.map((a) => evalAst(a, ctx));
      const out = fn(...args);
      return toNum(out);
    }
    case "ref": {
      const year = resolveYear(node, ctx);
      const sheet = node.sheet || ctx.sheet;
      const raw = ctx.getRef(sheet, node.section, node.row, year);
      return toNum(raw);
    }
    default:
      throw formulaError("Rumus tidak dikenal");
  }
}

function normalizeFormulaExpr(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return null;
  const stripped = raw.replace(/^=/, "").trim();
  return stripped || null;
}

function evaluateFormula(expr, ctx) {
  const ast = parseFormula(normalizeFormulaExpr(expr) == null ? "" : normalizeFormulaExpr(expr));
  return toNum(evalAst(ast, ctx));
}

function collectRefs(expr, ctx) {
  const norm = normalizeFormulaExpr(expr);
  if (!norm) return [];
  const ast = parseFormula(norm);
  const out = [];
  const seen = new Set();
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.t === "ref") {
      const sheet = n.sheet || (ctx && ctx.sheet);
      const year = resolveYear(n, ctx);
      const key = cellKey(sheet, n.section, n.row, year);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ sheet, section: n.section, row: n.row, year, key });
      }
    }
    ["l", "r", "x", "c", "a", "b"].forEach((k) => walk(n[k]));
    if (Array.isArray(n.args)) n.args.forEach(walk);
  };
  walk(ast);
  return out;
}

function cellKey(sheet, section, row, year) {
  return [sheet, section, row, String(year)].join("|");
}

function parseKey(key) {
  const parts = String(key).split("|");
  return { sheet: parts[0], section: parts[1], row: parts[2], year: parts[3] };
}

function refLabel(ref) {
  const alias = SHEET_ALIAS_BY_NAME[String(ref.sheet || "").toLowerCase()] || ref.sheet;
  const prefix = SECTION_PREFIX_REVERSE[ref.section] || ref.section;
  return `${alias}.${prefix}.${ref.row}[${ref.year}]`;
}

function readCell(data, sheet, section, row, year) {
  const sh = data && data.sheets ? data.sheets[sheet] : null;
  if (!sh) return 0;
  const yr = String(year);
  if (section === "data_penunjang") {
    const rec = (sh.records || []).find((r) => r.id === row);
    return rec ? toNum(rec.values[yr]) : 0;
  }
  const sec = sh[section];
  if (!sec || !sec[row]) return 0;
  return toNum(sec[row][yr]);
}

function writeCell(data, sheet, section, row, year, value) {
  const sh = data && data.sheets ? data.sheets[sheet] : null;
  if (!sh) return;
  const yr = String(year);
  if (section === "data_penunjang") {
    const rec = (sh.records || []).find((r) => r.id === row);
    if (rec) rec.values[yr] = value;
    return;
  }
  if (!sh[section]) sh[section] = {};
  if (!sh[section][row]) sh[section][row] = {};
  sh[section][row][yr] = value;
}

function rowExists(data, sheet, section, row) {
  const sh = data && data.sheets ? data.sheets[sheet] : null;
  if (!sh) return false;
  if (section === "data_penunjang") return (sh.records || []).some((r) => r.id === row);
  return !!(sh[section] && sh[section][row]);
}

function makeGetRef(data) {
  return (sheet, section, row, year) => {
    const sh = data.sheets[sheet];
    if (!sh) throw formulaError(`Sheet "${sheet}" tidak ditemukan`);
    const yr = String(year);
    if (section === "data_penunjang") {
      const rec = (sh.records || []).find((r) => r.id === row);
      if (!rec) throw formulaError(`Parameter "${row}" tidak ada di Data Penunjang`);
      return toNum(rec.values[yr]);
    }
    const sec = sh[section];
    if (!sec || !sec[row]) throw formulaError(`Baris "${row}" tidak ada di ${SECTION_LABEL[section] || section}`);
    return toNum(sec[row][yr]);
  };
}

function applyFormulaOverrides(data, builtin) {
  const cf = data.customFormulas;
  if (!cf) return false;
  const keys = Object.keys(cf);
  if (!keys.length) return false;
  const baseGetRef = makeGetRef(data);
  let prevSig = null;
  for (let iter = 0; iter < 5; iter += 1) {
    builtin(data);
    const cache = new Map();
    const stack = new Set();
    const getRef = (sheet, section, row, year) => {
      const yr = String(year);
      const key = cellKey(sheet, section, row, yr);
      if (Object.prototype.hasOwnProperty.call(cf, key)) {
        if (cache.has(key)) return cache.get(key);
        if (stack.has(key)) throw formulaError(`Rumus melingkar: ${refLabel({ sheet, section, row, year: yr })}`);
        stack.add(key);
        const value = evaluateFormula(cf[key], { sheet, year: yr, getRef });
        stack.delete(key);
        cache.set(key, value);
        return value;
      }
      return baseGetRef(sheet, section, row, yr);
    };
    for (const key of keys) {
      const parts = parseKey(key);
      const value = getRef(parts.sheet, parts.section, parts.row, parts.year);
      const rounded = Math.round(value * 1e6) / 1e6;
      writeCell(data, parts.sheet, parts.section, parts.row, parts.year, rounded);
    }
    const sig = keys.map((k) => `${k}=${cache.get(k)}`).join(";");
    if (sig === prevSig) break;
    prevSig = sig;
  }
  return true;
}

export {
  SECTION_PREFIX,
  SECTION_PREFIX_REVERSE,
  SECTION_LABEL,
  SHEET_ALIAS,
  SHEET_ALIAS_BY_NAME,
  parseFormula,
  evaluateFormula,
  collectRefs,
  normalizeFormulaExpr,
  refLabel,
  cellKey,
  parseKey,
  readCell,
  writeCell,
  rowExists,
  makeGetRef,
  applyFormulaOverrides,
};
