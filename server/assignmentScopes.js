// Helper aturan penugasan (LOCK/UNLOCK) berbasis cakupan.
//
// Prinsip:
// - Tidak ada salinan data. Semua aturan hanya menyimpan REFERENSI:
//   workbook_key, sheet_id, koordinat (r1,c1,r2,c2) pada sheet ASLI.
// - Resolusi memakai aturan "paling spesifik menang":
//   workbook (1) < sheet (2) < kolom/baris (3) < range (4) < cell (5).
// - Super Admin tidak pernah dibatasi.

const LEVELS = ["workbook", "sheet", "column", "row", "range", "cell"];

const SPECIFICITY = {
  workbook: 1,
  sheet: 2,
  column: 3,
  row: 3,
  range: 4,
  cell: 5,
};

const normKey = (v) => String(v == null ? "" : v).trim().toLowerCase();

// Ekstensi workbook yang dikenali. Sengaja TIDAK memakai /\.[^.]+$/ karena nama
// seperti "1. LK Neraca ..." akan terpotong jadi "1".
const WORKBOOK_EXT = /\.(xlsx|xlsm|xlsb|xls|ods|odsf|csv)$/i;

// Kunci workbook dinormalisasi: tanpa path, tanpa ekstensi, huruf kecil.
// Browser menyimpan nama file seperti "1. LK Neraca Fisik & Moneter Hutan.xlsx"
// sedangkan spreadsheet.sumber_file tanpa ekstensi - keduanya harus cocok.
function workbookAliases(v) {
  const raw = String(v == null ? "" : v).trim();
  if (!raw) return [];
  const base = raw.split(/[\\/]/).pop().trim();
  const noExt = base.replace(WORKBOOK_EXT, "").trim();
  return [...new Set([normKey(base), normKey(noExt), normKey(raw)])].filter(Boolean);
}

const normWorkbook = (v) => {
  const a = workbookAliases(v);
  return a.length ? a[1] || a[0] : "";
};

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch (_) { return null; }
};

// Kolom Excel (A, B, ... AA) -> indeks 0-based.
const colToIndex = (letters) => {
  const s = String(letters || "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return null;
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const colFromIndex = (i) => {
  let n = Number(i) + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const numOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

// Normalisasi satu baris DB -> bentuk aturan internal yang dipakai resolver.
function toRule(row) {
  const level = LEVELS.includes(row.level) ? row.level : "sheet";
  return {
    id: row.id,
    admin_id: Number(row.admin_id),
    workbookKey: String(row.workbook_key || ""),
    workbookName: String(row.workbook_name || ""),
    sheetId: row.sheet_id == null ? null : Number(row.sheet_id),
    sheetName: row.sheet_name == null ? null : String(row.sheet_name),
    level,
    r1: numOrNull(row.r1),
    c1: numOrNull(row.c1),
    r2: numOrNull(row.r2),
    c2: numOrNull(row.c2),
    colKeys: Array.isArray(parseJson(row.col_keys)) ? parseJson(row.col_keys).map(String) : null,
    status: row.status === "unlock" ? "unlock" : "lock",
    canEntry: Number(row.can_entry) !== 0,
    canEdit: Number(row.can_edit) !== 0,
  };
}

// Aturan yang relevan untuk satu sheet: level workbook, atau level lain pada
// sheet_id yang sama.
function rulesForSheet(rules, { workbookKey, sheetId }) {
  const wb = workbookAliases(workbookKey);
  const sid = sheetId == null ? null : Number(sheetId);
  return (rules || []).filter((r) => {
    if (wb.length) {
      const rw = workbookAliases(r.workbookKey);
      if (!rw.some((x) => wb.includes(x))) return false;
    }
    if (r.level === "workbook") return true;
    return sid != null && r.sheetId === sid;
  });
}

// Apakah satu aturan mencakup sel (row/col pada koordinat sheet asli, 0-based)?
function coversCell(rule, row, colIdx) {
  switch (rule.level) {
    case "workbook":
    case "sheet":
      return true;
    case "column": {
      if (colIdx == null) return false;
      const keys = rule.colKeys && rule.colKeys.length ? rule.colKeys : null;
      if (!keys) return true;
      return keys.some((k) => colToIndex(k) === colIdx);
    }
    case "row":
      return row != null && rule.r1 != null && rule.r2 != null && row >= rule.r1 && row <= rule.r2;
    case "range":
    case "cell": {
      if (row == null || colIdx == null) return false;
      if (rule.r1 == null || rule.r2 == null || rule.c1 == null || rule.c2 == null) return false;
      return row >= rule.r1 && row <= rule.r2 && colIdx >= rule.c1 && colIdx <= rule.c2;
    }
    default:
      return false;
  }
}

// Resolusi satu sel: aturan paling spesifik yang mencakup sel tersebut menang.
function resolveCell(rules, { workbookKey, sheetId, row, colIdx }) {
  const candidates = rulesForSheet(rules, { workbookKey, sheetId })
    .filter((r) => coversCell(r, row, colIdx))
    .sort((a, b) => (SPECIFICITY[b.level] || 0) - (SPECIFICITY[a.level] || 0) || a.id - b.id);
  const winner = candidates[0] || null;
  return {
    locked: winner ? winner.status === "lock" : null,
    status: winner ? winner.status : null,
    level: winner ? winner.level : null,
    ruleId: winner ? winner.id : null,
    canEdit: winner ? winner.canEdit : null,
    canEntry: winner ? winner.canEntry : null,
  };
}

// Ringkasan cakupan per level untuk satu sheet (dipakai UI & audit).
function summarize(rules, { workbookKey, sheetId }) {
  const rel = rulesForSheet(rules, { workbookKey, sheetId });
  const byLevel = {};
  for (const lv of LEVELS) byLevel[lv] = rel.filter((r) => r.level === lv);
  return byLevel;
}

// Teks range tampilan, mis. "D20" atau "A1:C10".
function rangeLabel(rule) {
  if (rule.level === "workbook") return "Seluruh workbook";
  if (rule.level === "sheet") return `Sheet ${rule.sheetName || rule.sheetId}`;
  if (rule.level === "column") {
    const keys = rule.colKeys || [];
    if (!keys.length) return "Semua kolom";
    const idx = keys.map(colToIndex).filter((n) => n != null).sort((a, b) => a - b);
    if (!idx.length) return keys.join(", ");
    const a = colFromIndex(idx[0]);
    const b = colFromIndex(idx[idx.length - 1]);
    return idx.length === 1 ? `Kolom ${a}` : `Kolom ${a}:${b}`;
  }
  if (rule.level === "row") return `Baris ${(rule.r1 ?? 0) + 1}:${(rule.r2 ?? 0) + 1}`;
  if (rule.level === "cell") return `${colFromIndex(rule.c1 ?? 0)}${(rule.r1 ?? 0) + 1}`;
  return `${colFromIndex(rule.c1 ?? 0)}${(rule.r1 ?? 0) + 1}:${colFromIndex(rule.c2 ?? 0)}${(rule.r2 ?? 0) + 1}`;
}

module.exports = {
  LEVELS,
  SPECIFICITY,
  colToIndex,
  colFromIndex,
  toRule,
  rulesForSheet,
  coversCell,
  resolveCell,
  summarize,
  rangeLabel,
  parseJson,
  normKey,
  normWorkbook,
  workbookAliases,
};
