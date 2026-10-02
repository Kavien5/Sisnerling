const STORAGE_KEY = "sisnerling_spreadsheet_workbook1";

export function loadWorkbook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sheets) || parsed.sheets.length === 0) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function getSheets() {
  const wb = loadWorkbook();
  return wb ? wb.sheets : [];
}

export function getNonEmptyRows(sheet) {
  if (!sheet || !Array.isArray(sheet.rows)) return [];
  const cols = sheet.columns || [];
  return sheet.rows.filter((row) =>
    cols.some((c) => row[c.key] !== "" && row[c.key] !== null && row[c.key] !== undefined)
  );
}

export function sheetNumericTotal(sheet) {
  if (!sheet) return 0;
  const cols = sheet.columns || [];
  let total = 0;
  for (const row of sheet.rows || []) {
    for (const c of cols) {
      const v = row[c.key];
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
      } else if (typeof v === "string" && v.trim() !== "" && !v.trim().startsWith("=")) {
        const n = Number(v.trim());
        if (Number.isFinite(n)) total += n;
      }
    }
  }
  return total;
}

export function sheetCellCount(sheet) {
  if (!sheet) return 0;
  const cols = sheet.columns || [];
  let count = 0;
  for (const row of sheet.rows || []) {
    for (const c of cols) {
      const v = row[c.key];
      if (v !== "" && v !== null && v !== undefined) count++;
    }
  }
  return count;
}
