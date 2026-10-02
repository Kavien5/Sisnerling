export function toNum(v) {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  if (v instanceof Date) return NaN;
  if (typeof v === "string") {
    let s = v.trim();
    if (s === "") return NaN;
    s = s.replace(/[Rp$€£¥\s]/g, "");
    s = s.replace(/\.(?=\d{3})/g, "");
    s = s.replace(",", ".");
    s = s.replace(/[^0-9.\-+]/g, "");
    if (s === "" || s === "." || s === "-") return NaN;
    return Number(s);
  }
  return NaN;
}

function isDateLikeText(t) {
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(t)) return true;
  if (/^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?$/.test(t)) return true;
  if (/^\d{4}$/.test(t)) {
    const y = Number(t);
    return y >= 1900 && y <= 2099;
  }
  return false;
}

export function detectColumnType(values) {
  let numCount = 0;
  let dateCount = 0;
  let textCount = 0;
  const sample = values.filter((v) => v !== null && v !== undefined && v !== "").slice(0, 80);
  if (sample.length === 0) return "text";
  for (const v of sample) {
    if (v instanceof Date) dateCount++;
    else if (typeof v === "number") {
      if (Number.isInteger(v) && v >= 1900 && v <= 2099) dateCount++;
      else numCount++;
    }
    else if (typeof v === "string" && v.trim() !== "") {
      const t = v.trim();
      if (isDateLikeText(t)) dateCount++;
      else if (!isNaN(toNum(t))) numCount++;
      else textCount++;
    }
  }
  const total = sample.length;
  if (dateCount >= total * 0.25 && dateCount >= numCount && dateCount > textCount) return "date";
  if (numCount >= total * 0.25 && numCount > dateCount && numCount > textCount) return "number";
  return "text";
}

export function parsePeriod(value, groupBy) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return groupBy === "year"
      ? String(value.getFullYear())
      : `${value.getFullYear()}-${pad2(value.getMonth() + 1)}`;
  }
  const s = String(value).trim();
  if (s === "") return null;

  const yearOnly = /^(\d{4})$/.exec(s);
  if (yearOnly) {
    const y = yearOnly[1];
    return groupBy === "year" ? y : `${y}-01`;
  }

  const ymd = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/.exec(s);
  if (ymd) {
    const y = ymd[1];
    const mo = pad2(Math.min(12, Math.max(1, parseInt(ymd[2], 10))));
    return groupBy === "year" ? y : `${y}-${mo}`;
  }

  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (dmy) {
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    const mo = pad2(Math.min(12, Math.max(1, parseInt(dmy[2], 10))));
    return groupBy === "year" ? String(y) : `${y}-${mo}`;
  }
  return null;
}

export function periodLabel(key, groupBy) {
  if (!key) return "";
  if (groupBy === "year") return key;
  const [y, mo] = key.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "short" }).format(d);
  return `${monthName} ${y}`;
}

export function sheetsToTables(sheets) {
  if (!Array.isArray(sheets)) return [];
  return sheets
    .filter((s) => s && Array.isArray(s.columns) && Array.isArray(s.rows))
    .map((s) => ({
      name: s.name,
      headers: s.columns.map((c) => c.label || c.key || ""),
      rows: s.rows.map((r) => s.columns.map((c) => (r[c.key] === undefined ? "" : r[c.key]))),
    }));
}

const pad2 = (n) => String(n).padStart(2, "0");