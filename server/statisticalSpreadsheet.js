const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const ExcelJS = require("exceljs");
const express = require("express");
const { pool } = require("./db");
const { getWorkbookAccess } = require("./collab");

const MODULES = [
  {
    key: "neraca-hutan",
    nama: "Neraca Fisik & Moneter Hutan",
    workbookKey: "sisnerling-statistical:neraca-hutan",
    sourceFile: "neraca-hutan.xlsx",
    primarySheets: ["Jati Jawa", "Rimba Jawa", "Rimba Luar Jawa", "Indonesia", "Rekap Hutan Indonesia"],
    parameterSheets: ["Data Penunjang"],
  },
  {
    key: "neraca-mineral-energi",
    nama: "Neraca Aset Mineral & Energi",
    workbookKey: "sisnerling-statistical:neraca-mineral-energi",
    sourceFile: "neraca-mineral-energi.xlsx",
    primarySheets: ["Oil", "Gas", "Coal", "Gold", "Silver", "Copper", "Tin", "Nickel", "Bauxite"],
    parameterSheets: ["Lakin", "Conversion Factor", "Harga Acuan"],
  },
];

const isExternalFormula = (formula) => /\[\d+\]/.test(String(formula || ""));
let formulaEnginePromise;
let writeAccessCheck = async () => false;

function setStatisticalWriteAccessCheck(check) {
  writeAccessCheck = check;
}

function getFormulaEngine() {
  if (!formulaEnginePromise) {
    const enginePath = path.resolve(__dirname, "../client/src/spreadsheet.js");
    formulaEnginePromise = import(pathToFileURL(enginePath).href);
  }
  return formulaEnginePromise;
}

function encodeValue(value) {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value && typeof value === "object") {
    if (value.error) return { $error: String(value.error) };
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (value.text !== undefined) return value.text;
  }
  return value === undefined ? null : value;
}

function decodeValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.$date) return new Date(value.$date);
    if (value.$error) return value.$error;
  }
  return value;
}

function jsonValue(value) {
  const encoded = encodeValue(value);
  return encoded === null || encoded === undefined ? null : JSON.stringify(encoded);
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function numericYear(value) {
  const match = /^((?:18|19|20|21)\d{2})(?:\*{0,2})?$/.exec(String(value ?? "").trim());
  const year = match ? Number(match[1]) : Number(value);
  return Number.isInteger(year) && year >= 1800 && year <= 2199 ? year : null;
}

function findYearRuns(rows, colName) {
  const runs = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    let start = null;
    let previous = null;
    for (let colIndex = 0; colIndex < rows[rowIndex].length; colIndex++) {
      const cell = rows[rowIndex][colIndex];
      const value = numericYear(cell && cell.displayValue);
      if (value !== null && (previous === null || value === previous + 1)) {
        if (start === null) start = colIndex;
        previous = value;
        continue;
      }
      if (start !== null && previous - numericYear(rows[rowIndex][start].displayValue) >= 2) {
        runs.push({ rowIndex, startCol: start, endCol: colIndex - 1, lastYear: previous });
      }
      start = value === null ? null : colIndex;
      previous = value;
    }
    if (start !== null && previous - numericYear(rows[rowIndex][start].displayValue) >= 2) {
      runs.push({ rowIndex, startCol: start, endCol: rows[rowIndex].length - 1, lastYear: previous });
    }
  }
  const byRange = new Map();
  for (const run of runs) {
    const key = `${run.startCol}:${run.endCol}`;
    const group = byRange.get(key) || { startCol: run.startCol, endCol: run.endCol, lastYear: run.lastYear, rows: [] };
    group.lastYear = Math.max(group.lastYear, run.lastYear);
    group.rows.push(run.rowIndex);
    byRange.set(key, group);
  }
  return [...byRange.values()];
}

function toFormulaKey(sheetId, rowNo, colNo) {
  return `${sheetId}:${rowNo}:${colNo}`;
}

function shiftMergeRangeColumns(range, atCol, engine) {
  const match = /^(\$?)([A-Z]+)(\$?)(\d+):(\$?)([A-Z]+)(\$?)(\d+)$/i.exec(range);
  if (!match) return range;
  const shift = (absolute, letters) => {
    const index = engine.colIndex(letters);
    return `${absolute}${engine.colName(index >= atCol ? index + 1 : index)}`;
  };
  return `${shift(match[1], match[2])}${match[3]}${match[4]}:${shift(match[5], match[6])}${match[7]}${match[8]}`;
}

function refToPosition(ref, currentSheet, byName, engine) {
  const match = /^(?:'((?:[^']|'')+)'!|([A-Za-z_][A-Za-z0-9_. ]*)!)?\$?([A-Z]{1,3})\$?(\d+)$/i.exec(ref);
  if (!match) return null;
  const namedSheet = match[1] ? match[1].replace(/''/g, "'") : match[2];
  const sheet = namedSheet ? byName.get(namedSheet.trim().toUpperCase()) : currentSheet;
  if (!sheet) return null;
  return {
    sheetId: sheet.id,
    rowNo: Number(match[4]),
    colNo: engine.colIndex(match[3]) + 1,
  };
}

function formulaDependencies(cell, currentSheet, byName, engine) {
  if (!cell.formula || cell.external_formula) return [];
  const expression = String(cell.formula).replace(/"(?:""|[^"])*"/g, '""');
  const refs = [];
  const pattern = /(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_. ]*))!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/gi;
  let match;
  while ((match = pattern.exec(expression))) {
    const sheetName = match[1] ? match[1].replace(/''/g, "'") : match[2];
    if (sheetName && /^\[\d+\]/.test(sheetName)) continue;
    const first = refToPosition(`${sheetName ? `'${sheetName}'!` : ""}${match[3]}`, currentSheet, byName, engine);
    if (!first) continue;
    const secondRef = match[4];
    const second = secondRef
      ? refToPosition(`${sheetName ? `'${sheetName}'!` : ""}${secondRef}`, currentSheet, byName, engine)
      : first;
    if (!second || second.sheetId !== first.sheetId) continue;
    const minRow = Math.min(first.rowNo, second.rowNo);
    const maxRow = Math.max(first.rowNo, second.rowNo);
    const minCol = Math.min(first.colNo, second.colNo);
    const maxCol = Math.max(first.colNo, second.colNo);
    if ((maxRow - minRow + 1) * (maxCol - minCol + 1) > 20000) {
      throw new Error(`Rentang rumus terlalu besar: ${cell.nama}!${engine.cellAddress(cell.col_no - 1, cell.row_no - 1)}`);
    }
    for (let rowNo = minRow; rowNo <= maxRow; rowNo++) {
      for (let colNo = minCol; colNo <= maxCol; colNo++) refs.push(toFormulaKey(first.sheetId, rowNo, colNo));
    }
  }
  return [...new Set(refs)];
}

function buildDependents(cells, sheets, engine) {
  const byName = new Map(sheets.map((sheet) => [sheet.nama.toUpperCase(), sheet]));
  const dependents = new Map();
  for (const cell of cells) {
    if (cell.jenis !== "formula") continue;
    const owner = byName.get(cell.sheet_name.toUpperCase());
    for (const dependency of formulaDependencies(cell, owner, byName, engine)) {
      const list = dependents.get(dependency) || [];
      list.push(toFormulaKey(cell.sheet_id, cell.row_no, cell.col_no));
      dependents.set(dependency, list);
    }
  }
  return dependents;
}

function affectedFormulaKeys(startKey, dependents) {
  const visited = new Set();
  const queue = [...(dependents.get(startKey) || [])];
  while (queue.length) {
    const key = queue.shift();
    if (visited.has(key)) continue;
    visited.add(key);
    queue.push(...(dependents.get(key) || []));
  }
  return visited;
}

function buildWorkbookState(sheets, cells, engine) {
  const rowsBySheet = new Map();
  for (const sheet of sheets) {
    rowsBySheet.set(
      sheet.id,
      Array.from({ length: Number(sheet.max_row) }, () => ({}))
    );
  }
  for (const cell of cells) {
    const row = rowsBySheet.get(cell.sheet_id)?.[cell.row_no - 1];
    if (!row) continue;
    const key = engine.colName(cell.col_no - 1);
    const inputValue = decodeValue(parseJson(cell.nilai));
    const resultValue = decodeValue(parseJson(cell.hasil));
    row[key] =
      cell.jenis === "formula" && !cell.formula_fallback && !cell.external_formula
        ? `=${cell.formula}`
        : cell.jenis === "formula"
          ? resultValue
          : inputValue;
  }
  const byName = new Map();
  for (const sheet of sheets) {
    const columns = Array.from({ length: Number(sheet.max_col) }, (_, col) => ({
      key: engine.colName(col),
    }));
    const state = { id: sheet.id, nama: sheet.nama, rows: rowsBySheet.get(sheet.id), columns };
    byName.set(sheet.nama.toUpperCase(), state);
  }
  return { byName };
}

function serializeCellOutput(value) {
  const encoded = encodeValue(value);
  return encoded === undefined ? null : JSON.stringify(encoded);
}

async function evaluateTargets(sheets, cells, engine, targetKeys = null) {
  const { byName } = buildWorkbookState(sheets, cells, engine);
  const results = new Map();
  const requestedSheets = targetKeys
    ? [...new Set([...targetKeys].map((key) => Number(key.split(":")[0])))]
    : sheets.map((sheet) => Number(sheet.id));
  for (const sheetId of requestedSheets) {
    const sheet = sheets.find((entry) => Number(entry.id) === sheetId);
    const state = byName.get(sheet.nama.toUpperCase());
    const evaluated = engine.evaluateGrid(
      state.rows,
      state.columns,
      Object.fromEntries(byName),
      sheet.nama
    );
    for (const [key, value] of evaluated) {
      const [rowIndex, colKey] = key.split(":");
      results.set(toFormulaKey(sheetId, Number(rowIndex) + 1, engine.colIndex(colKey) + 1), value);
    }
  }
  return results;
}

function worksheetValues(worksheet, maxRow, maxCol) {
  const values = [];
  for (let rowNo = 1; rowNo <= maxRow; rowNo++) {
    const row = [];
    for (let colNo = 1; colNo <= maxCol; colNo++) {
      const cell = worksheet.getCell(rowNo, colNo);
      const formula = cell.formula;
      const value = cell.value;
      row.push({
        row_no: rowNo,
        col_no: colNo,
        formula: formula ? String(formula) : null,
        external_formula: formula ? isExternalFormula(formula) : false,
        value: formula ? null : encodeValue(value),
        cached_value: formula ? encodeValue(value && typeof value === "object" && "result" in value ? value.result : cell.result) : null,
        number_format: cell.numFmt || null,
        displayValue: formula
          ? (value && typeof value === "object" && "result" in value ? encodeValue(value.result) : encodeValue(cell.result))
          : encodeValue(value),
        hasStyle: !!cell.style && Object.keys(cell.style).length > 0,
      });
    }
    values.push(row);
  }
  return values;
}

async function seedModule(module) {
  const moduleRow = await pool.query("SELECT module_key FROM statistical_modules WHERE module_key = ?", [module.key]);
  if (moduleRow[0].length) {
    await initializeModuleFormulaValues(module.key);
    return;
  }

  const templatePath = path.join(__dirname, "storage", "templates", module.sourceFile);
  if (!fs.existsSync(templatePath)) throw new Error(`Template statistik tidak ditemukan: ${templatePath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const engine = await getFormulaEngine();
  const prepared = [];
  for (const worksheet of workbook.worksheets) {
    let maxRow = 0;
    let maxCol = 0;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNo) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        maxRow = Math.max(maxRow, rowNo);
        maxCol = Math.max(maxCol, cell.col);
      });
    });
    if (!maxRow || !maxCol) continue;
    const values = worksheetValues(worksheet, maxRow, maxCol);
    const yearRuns = findYearRuns(values, engine.colName);
    const yearHeaders = new Set();
    const yearCols = new Set();
    for (const run of yearRuns) {
      for (let col = run.startCol; col <= run.endCol; col++) yearCols.add(col);
      for (const rowNo of run.rows) yearHeaders.add(`${rowNo + 1}:${run.endCol + 1}`);
    }
    const cells = [];
    for (let rowIndex = 0; rowIndex < maxRow; rowIndex++) {
      const row = values[rowIndex];
      const hasYearValues = yearCols.size > 0 && [...yearCols].some((col) => {
        const candidate = row[col];
        return candidate && (candidate.formula || (typeof candidate.value === "number" && candidate.value !== null));
      });
      for (let colIndex = 0; colIndex < maxCol; colIndex++) {
        const source = row[colIndex];
        const isYearHeader = yearHeaders.has(`${rowIndex + 1}:${colIndex + 1}`);
        let kind = source.formula ? "formula" : "static";
        let inputValue = source.value;
        if (!source.formula && !isYearHeader && colIndex > 0 && yearCols.has(colIndex) &&
            (typeof source.value === "number" || (source.value && source.value.$date))) {
          kind = "input";
        } else if (!source.formula && !source.value && hasYearValues &&
                   yearCols.has(colIndex) && !isYearHeader && colIndex > 0 &&
                   source.hasStyle && /[0#]/.test(source.number_format || "")) {
          kind = "input";
          inputValue = null;
        }
        if (kind === "static" && !source.value) continue;
        if (kind === "formula" || kind === "input" || source.value !== null) {
          cells.push({
            row_no: rowIndex + 1,
            col_no: colIndex + 1,
            jenis: kind,
            nilai: kind === "input" ? inputValue : (kind === "static" ? source.value : null),
            nilai_awal: kind === "input" ? inputValue : null,
            hasil: kind === "formula" ? source.cached_value : null,
            formula: source.formula,
            formula_fallback: 0,
            external_formula: source.external_formula ? 1 : 0,
            number_format: source.number_format,
          });
        }
      }
    }
    prepared.push({
      worksheet,
      nama: worksheet.name,
      maxRow,
      maxCol,
      yearRuns,
      cells,
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "INSERT INTO statistical_modules (module_key, nama, workbook_key, source_file) VALUES (?, ?, ?, ?)",
      [module.key, module.nama, module.workbookKey, module.sourceFile]
    );
    for (let sheetOrder = 0; sheetOrder < prepared.length; sheetOrder++) {
      const sheet = prepared[sheetOrder];
      const permissionName = `[Modul Statistik] ${module.nama} — ${sheet.nama}`;
      const permissionColumns = Array.from({ length: sheet.maxCol }, (_, col) => ({
        key: engine.colName(col),
        label: engine.colName(col),
        type: "number",
      }));
      const [[existingPermissionSheet]] = await connection.query(
        "SELECT id FROM spreadsheet WHERE nama = ?",
        [permissionName]
      );
      let permissionSheetId = existingPermissionSheet?.id;
      if (!permissionSheetId) {
        const [insertedPermissionSheet] = await connection.query(
          "INSERT INTO spreadsheet (nama, sumber_file, kolom) VALUES (?, ?, ?)",
          [permissionName, module.workbookKey, JSON.stringify(permissionColumns)]
        );
        permissionSheetId = insertedPermissionSheet.insertId;
      }
      const merges = sheet.worksheet.model.merges || [];
      const widths = sheet.worksheet.columns.map((column) => column.width || null);
      const heights = [];
      sheet.worksheet.eachRow({ includeEmpty: false }, (row, rowNo) => {
        if (row.height) heights.push([rowNo, row.height]);
      });
      const [insertedSheet] = await connection.query(
        `INSERT INTO statistical_sheets
          (module_key, nama, urutan, max_row, max_col, permission_sheet_id, merges, column_widths, row_heights)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          module.key,
          sheet.nama,
          sheetOrder,
          sheet.maxRow,
          sheet.maxCol,
          permissionSheetId,
          JSON.stringify(merges),
          JSON.stringify(widths),
          JSON.stringify(heights),
        ]
      );
      for (let start = 0; start < sheet.cells.length; start += 250) {
        const batch = sheet.cells.slice(start, start + 250);
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const params = [];
        for (const cell of batch) {
          params.push(
            insertedSheet.insertId,
            cell.row_no,
            cell.col_no,
            cell.jenis,
            jsonValue(cell.nilai),
            jsonValue(cell.nilai_awal),
            jsonValue(cell.hasil),
            cell.formula,
            cell.formula_fallback,
            cell.external_formula,
            cell.number_format
          );
        }
        await connection.query(
          `INSERT INTO statistical_cells
            (sheet_id, row_no, col_no, jenis, nilai, nilai_awal, hasil, formula,
             formula_fallback, external_formula, number_format)
           VALUES ${placeholders}`,
          params
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await initializeModuleFormulaValues(module.key);
}

// Jejak isi modul yang menentukan hasil kalkulasi. Diperbarui tiap kali
// initializeModuleFormulaValues menuntaskan kalkulasi ulang sehingga boot
// berikutnya bisa melewati proses tersebut bila belum ada perubahan.
function moduleStateHash(sheets, cells) {
  const h = crypto.createHash("sha256");
  for (const s of sheets) h.update(`${s.id}|${s.nama}|${s.urutan}|${s.max_row}|${s.max_col};`);
  for (const c of cells) {
    h.update(`${c.sheet_id}|${c.row_no}|${c.col_no}|${c.jenis}|${c.nilai ?? ""}|${c.formula ?? ""}|${c.formula_fallback ?? 0}|${c.external_formula ?? 0};`);
  }
  return h.digest("hex");
}

async function initializeModuleFormulaValues(moduleKey) {
  const engine = await getFormulaEngine();
  const [sheets] = await pool.query(
    `SELECT s.* FROM statistical_sheets s WHERE s.module_key = ? ORDER BY s.urutan`,
    [moduleKey]
  );
  const [cells] = await pool.query(
    `SELECT c.*, s.nama AS sheet_name
       FROM statistical_cells c JOIN statistical_sheets s ON s.id = c.sheet_id
      WHERE s.module_key = ?`,
    [moduleKey]
  );

  const hash = moduleStateHash(sheets, cells);
  const [[state]] = await pool.query(
    "SELECT seed_hash FROM statistical_module_state WHERE module_key = ?",
    [moduleKey]
  );
  if (state && state.seed_hash === hash) return;

  const initialResults = await evaluateTargets(sheets, cells, engine);
  const fallbackKeys = [];
  for (const cell of cells) {
    if (cell.jenis !== "formula" || cell.external_formula) continue;
    const calculated = initialResults.get(toFormulaKey(cell.sheet_id, cell.row_no, cell.col_no));
    const cached = decodeValue(parseJson(cell.hasil));
    if (typeof calculated === "string" && calculated.startsWith("#") &&
        cached !== null && cached !== undefined &&
        !(typeof cached === "string" && cached.startsWith("#"))) {
      fallbackKeys.push(toFormulaKey(cell.sheet_id, cell.row_no, cell.col_no));
    }
  }
  if (fallbackKeys.length) {
    for (const key of fallbackKeys) {
      const [sheetId, rowNo, colNo] = key.split(":").map(Number);
      await pool.query(
        "UPDATE statistical_cells SET formula_fallback = 1 WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
        [sheetId, rowNo, colNo]
      );
    }
  }
  const fallbackSet = new Set(fallbackKeys);
  const recalculationTargets = new Set(
    cells.filter((cell) => cell.jenis === "formula" && !cell.external_formula && !fallbackSet.has(toFormulaKey(cell.sheet_id, cell.row_no, cell.col_no)))
      .map((cell) => toFormulaKey(cell.sheet_id, cell.row_no, cell.col_no))
  );
  const stableResults = await evaluateTargets(sheets, cells, engine, recalculationTargets);
  for (const [key, result] of stableResults) {
    const [sheetId, rowNo, colNo] = key.split(":").map(Number);
    await pool.query(
      "UPDATE statistical_cells SET hasil = ? WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
      [serializeCellOutput(result), sheetId, rowNo, colNo]
    );
  }

  await pool.query(
    "INSERT INTO statistical_module_state (module_key, seed_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE seed_hash = VALUES(seed_hash)",
    [moduleKey, hash]
  );
}

async function initializeStatisticalWorkbooks() {
  for (const module of MODULES) await seedModule(module);
}

function parseLocaleNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let text = String(value).trim().replace(/\s/g, "");
  if (!/^[+-]?(?:\d+|\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d+)?$/.test(text)) return NaN;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    text = text.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if ((text.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

async function loadModuleState(connection, moduleKey, lock = false) {
  const [sheets] = await connection.query(
    `SELECT * FROM statistical_sheets WHERE module_key = ? ORDER BY urutan${lock ? " FOR UPDATE" : ""}`,
    [moduleKey]
  );
  const [cells] = await connection.query(
    `SELECT c.*, s.nama AS sheet_name
       FROM statistical_cells c
       JOIN statistical_sheets s ON s.id = c.sheet_id
      WHERE s.module_key = ?
      ORDER BY s.urutan, c.row_no, c.col_no${lock ? " FOR UPDATE" : ""}`,
    [moduleKey]
  );
  return { sheets, cells };
}

function outputCell(cell, engine, calculated = null) {
  const current = cell.jenis === "formula"
    ? (calculated ?? decodeValue(parseJson(cell.hasil)))
    : decodeValue(parseJson(cell.nilai));
  return {
    row: Number(cell.row_no),
    col: Number(cell.col_no),
    ref: engine.cellAddress(Number(cell.col_no) - 1, Number(cell.row_no) - 1),
    kind: cell.jenis,
    value: current,
    version: Number(cell.versi),
    numberFormat: cell.number_format,
  };
}

async function recalculateAndSave(connection, moduleKey, sheets, cells, targetKeys, engine) {
  if (!targetKeys.size) return [];
  const formulaCells = new Map(
    cells
      .filter((cell) => cell.jenis === "formula")
      .map((cell) => [toFormulaKey(cell.sheet_id, cell.row_no, cell.col_no), cell])
  );
  for (const key of targetKeys) {
    const cell = formulaCells.get(key);
    if (cell && cell.formula_fallback && !cell.external_formula) {
      throw Object.assign(
        new Error(`Rumus ${cell.sheet_name}!${engine.cellAddress(cell.col_no - 1, cell.row_no - 1)} memerlukan sumber yang belum tersedia; perubahan tidak disimpan.`),
        { status: 422 }
      );
    }
  }
  const results = await evaluateTargets(sheets, cells, engine, targetKeys);
  const recalculated = [];
  for (const key of targetKeys) {
    const cell = formulaCells.get(key);
    if (!cell) continue;
    const value = results.get(key);
    if (typeof value === "string" && /^#(?:NAME\?|REF!|VALUE!|CYCLE!|ERROR!|REF_FILE!)/.test(value)) {
      throw Object.assign(
        new Error(`Rumus ${cell.sheet_name}!${engine.cellAddress(cell.col_no - 1, cell.row_no - 1)} menghasilkan ${value}; perubahan tidak disimpan karena hasil tidak dapat dihitung dengan sumber yang tersedia.`),
        { status: 422 }
      );
    }
    await connection.query(
      "UPDATE statistical_cells SET hasil = ? WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
      [serializeCellOutput(value), cell.sheet_id, cell.row_no, cell.col_no]
    );
    cell.hasil = serializeCellOutput(value);
    recalculated.push({ sheet_id: Number(cell.sheet_id), row: Number(cell.row_no), col: Number(cell.col_no), value });
  }
  return recalculated;
}

async function createStatisticalRouter({ pool: db = pool } = {}) {
  const router = express.Router();
  const engine = await getFormulaEngine();

  router.get("/modules", async (_req, res, next) => {
    try {
      const [modules] = await db.query(
        "SELECT module_key, nama, workbook_key FROM statistical_modules ORDER BY module_key"
      );
      const result = [];
      for (const module of modules) {
        const access = await getWorkbookAccess(_req.user, module.workbook_key);
        if (!access.read) continue;
        const [sheets] = await db.query(
          `SELECT id, nama, urutan, max_row, max_col, permission_sheet_id
             FROM statistical_sheets WHERE module_key = ? ORDER BY urutan`,
          [module.module_key]
        );
        result.push({
          key: module.module_key,
          name: module.nama,
          workbookKey: module.workbook_key,
          access,
          sheets: sheets.map((sheet) => ({
            id: Number(sheet.id),
            name: sheet.nama,
            order: Number(sheet.urutan),
            rows: Number(sheet.max_row),
            columns: Number(sheet.max_col),
            primary: MODULES.find((entry) => entry.key === module.module_key)?.primarySheets.includes(sheet.nama) || false,
            parameter: MODULES.find((entry) => entry.key === module.module_key)?.parameterSheets.includes(sheet.nama) || false,
            permissionSheetId: Number(sheet.permission_sheet_id),
          })),
        });
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/modules/:moduleKey/sheets/:sheetId", async (req, res, next) => {
    try {
      const [[sheet]] = await db.query(
        `SELECT s.*, m.nama AS module_name, m.workbook_key
           FROM statistical_sheets s
           JOIN statistical_modules m ON m.module_key = s.module_key
          WHERE s.module_key = ? AND s.id = ?`,
        [req.params.moduleKey, Number(req.params.sheetId)]
      );
      if (!sheet) return res.status(404).json({ error: "Tabel statistik tidak ditemukan" });
      const access = await getWorkbookAccess(req.user, sheet.workbook_key);
      if (!access.read) return res.status(403).json({ error: "Anda tidak memiliki akses ke modul ini" });
      const [cells] = await db.query(
        "SELECT * FROM statistical_cells WHERE sheet_id = ? ORDER BY row_no, col_no",
        [sheet.id]
      );
      const yearGrid = Array.from({ length: Number(sheet.max_row) }, () =>
        Array.from({ length: Number(sheet.max_col) }, () => ({ displayValue: null }))
      );
      for (const cell of cells) {
        const encoded = parseJson(cell.jenis === "formula" ? cell.hasil : cell.nilai);
        yearGrid[Number(cell.row_no) - 1][Number(cell.col_no) - 1].displayValue = decodeValue(encoded);
      }
      const yearRuns = findYearRuns(yearGrid, engine.colName);
      const latestYear = yearRuns.length ? Math.max(...yearRuns.map((run) => run.lastYear)) : null;
      const headerRun = latestYear === null
        ? null
        : yearRuns
          .filter((run) => run.lastYear === latestYear)
          .sort((a, b) => Math.min(...a.rows) - Math.min(...b.rows))[0];
      const headerIndexes = new Set(headerRun?.rows || []);
      const firstHeader = headerRun ? Math.min(...headerRun.rows) : -1;
      const headerRows = [];
      for (let rowIndex = firstHeader; headerIndexes.has(rowIndex); rowIndex++) {
        headerRows.push(rowIndex + 1);
      }
      res.json({
        sheet: {
          id: Number(sheet.id),
          name: sheet.nama,
          module: sheet.module_name,
          workbookKey: sheet.workbook_key,
          rows: Number(sheet.max_row),
          columns: Number(sheet.max_col),
          merges: parseJson(sheet.merges) || [],
          columnWidths: parseJson(sheet.column_widths) || [],
          rowHeights: parseJson(sheet.row_heights) || [],
          headerRows,
          permissionSheetId: Number(sheet.permission_sheet_id),
        },
        cells: cells.map((cell) => outputCell(cell, engine)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/cells", async (req, res, next) => {
    const connection = await db.getConnection();
    try {
      const sheetId = Number(req.body && req.body.sheet_id);
      const rowNo = Number(req.body && req.body.row);
      const colNo = Number(req.body && req.body.col);
      const baseVersion = Number(req.body && req.body.base_version);
      if (![sheetId, rowNo, colNo, baseVersion].every(Number.isSafeInteger) ||
          sheetId < 1 || rowNo < 1 || colNo < 1 || baseVersion < 1) {
        return res.status(400).json({ error: "Identitas sel dan versi dasar wajib valid" });
      }
      await connection.beginTransaction();
      const [[sheetRef]] = await connection.query(
        "SELECT module_key FROM statistical_sheets WHERE id = ?",
        [sheetId]
      );
      if (!sheetRef) {
        await connection.rollback();
        return res.status(404).json({ error: "Tabel statistik tidak ditemukan" });
      }
      const [[moduleLock]] = await connection.query(
        "SELECT module_key FROM statistical_modules WHERE module_key = ? FOR UPDATE",
        [sheetRef.module_key]
      );
      if (!moduleLock) {
        await connection.rollback();
        return res.status(404).json({ error: "Modul statistik tidak ditemukan" });
      }
      const [[sheet]] = await connection.query(
        `SELECT s.*, m.workbook_key FROM statistical_sheets s
          JOIN statistical_modules m ON m.module_key = s.module_key
         WHERE s.id = ? FOR UPDATE`,
        [sheetId]
      );
      if (!sheet || sheet.module_key !== sheetRef.module_key) {
        await connection.rollback();
        return res.status(404).json({ error: "Tabel statistik tidak ditemukan" });
      }
      const [[cell]] = await connection.query(
        "SELECT * FROM statistical_cells WHERE sheet_id = ? AND row_no = ? AND col_no = ? FOR UPDATE",
        [sheetId, rowNo, colNo]
      );
      if (!cell || cell.jenis !== "input") {
        await connection.rollback();
        return res.status(400).json({ error: "Sel ini dikunci: hanya sel angka input yang dapat diubah" });
      }
      if (Number(cell.versi) !== baseVersion) {
        await connection.rollback();
        return res.status(409).json({ error: "Sel ini sudah diubah pengguna lain. Muat ulang sebelum menyimpan.", current: outputCell(cell, engine) });
      }
      const allowed = await writeAccessCheck(req, sheet, rowNo, colNo);
      if (!allowed) {
        await connection.rollback();
        return res.status(403).json({ error: "Anda tidak memiliki izin mengubah sel ini" });
      }
      const newValue = parseLocaleNumber(req.body.value);
      if (Number.isNaN(newValue)) {
        await connection.rollback();
        return res.status(400).json({ error: "Nilai input harus berupa angka desimal atau dikosongkan" });
      }
      const { sheets, cells } = await loadModuleState(connection, sheet.module_key, true);
      const dependents = buildDependents(cells, sheets, engine);
      const changedKey = toFormulaKey(sheetId, rowNo, colNo);
      const affected = affectedFormulaKeys(changedKey, dependents);
      const fallbackFormula = cells.find((candidate) =>
        affected.has(toFormulaKey(candidate.sheet_id, candidate.row_no, candidate.col_no)) &&
        candidate.formula_fallback && !candidate.external_formula
      );
      if (fallbackFormula) {
        await connection.rollback();
        return res.status(422).json({
          error: `Perubahan memengaruhi rumus ${fallbackFormula.sheet_name}!${engine.cellAddress(fallbackFormula.col_no - 1, fallbackFormula.row_no - 1)} yang memerlukan sumber eksternal; nilai tidak disimpan.`,
        });
      }
      await connection.query(
        "UPDATE statistical_cells SET nilai = ?, versi = versi + 1, updated_by = ? WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
        [jsonValue(newValue), req.user.id, sheetId, rowNo, colNo]
      );
      const changedCell = cells.find((candidate) =>
        Number(candidate.sheet_id) === sheetId &&
        Number(candidate.row_no) === rowNo &&
        Number(candidate.col_no) === colNo
      );
      if (!changedCell) throw new Error("Input tidak ditemukan saat menghitung ulang modul statistik");
      changedCell.nilai = jsonValue(newValue);
      const recalculated = await recalculateAndSave(connection, sheet.module_key, sheets, cells, affected, engine);
      await connection.commit();
      res.json({
        message: "Perubahan tersimpan",
        cell: { row: rowNo, col: colNo, value: newValue, version: baseVersion + 1 },
        recalculated,
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Gagal membatalkan transaksi perubahan sel statistik:", rollbackError);
      }
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    } finally {
      connection.release();
    }
  });

  router.post("/modules/:moduleKey/sheets/:sheetId/tahun", async (req, res, next) => {
    const connection = await db.getConnection();
    try {
      const [[module]] = await connection.query(
        "SELECT * FROM statistical_modules WHERE module_key = ?",
        [req.params.moduleKey]
      );
      if (!module) return res.status(404).json({ error: "Modul statistik tidak ditemukan" });
      if (req.user.role !== "super_admin") {
        return res.status(403).json({ error: "Hanya Super Admin yang dapat mengubah struktur tahun" });
      }
      const sheetId = Number(req.params.sheetId);
      if (!Number.isSafeInteger(sheetId) || sheetId < 1) {
        return res.status(400).json({ error: "Identitas lembar tidak valid" });
      }
      await connection.beginTransaction();
      await connection.query("SELECT module_key FROM statistical_modules WHERE module_key = ? FOR UPDATE", [module.module_key]);
      const { sheets, cells } = await loadModuleState(connection, module.module_key, true);
      const state = buildWorkbookState(sheets, cells, engine);
      const targetSheet = sheets.find((sheet) => Number(sheet.id) === sheetId);
      if (!targetSheet) {
        await connection.rollback();
        return res.status(404).json({ error: "Lembar statistik tidak ditemukan pada modul ini" });
      }
      const inserted = [];
      const insertedCellKeys = new Set();
      const insertedFormulaKeys = new Set();
      for (const sheet of sheets) {
        if (Number(sheet.id) !== sheetId) continue;
        const grid = state.byName.get(sheet.nama.toUpperCase()).rows;
        const runs = findYearRuns(grid.map((row) =>
          Array.from({ length: Number(sheet.max_col) }, (_, col) => ({
            displayValue: row[engine.colName(col)] ?? null,
          }))
        ), engine.colName);
        if (!runs.length) continue;
        const latestYear = Math.max(...runs.map((run) => run.lastYear));
        const latestRuns = runs.filter((run) => run.lastYear === latestYear);
        const selectedRuns = [...new Map(latestRuns.map((run) => [
          `${run.startCol}:${run.endCol}`,
          run,
        ])).values()].sort((a, b) => b.endCol - a.endCol);
        for (const run of selectedRuns) {
        const { sheets: currentSheets, cells: currentCells } = await loadModuleState(connection, module.module_key, true);
        const currentSheet = currentSheets.find((entry) => Number(entry.id) === Number(sheet.id));
        if (!currentSheet) throw new Error(`Lembar "${sheet.nama}" tidak ditemukan saat menambah tahun.`);
        const insertCol = run.endCol + 1;
        const prevCol = run.endCol;
        const priorYear = run.lastYear;
        const sheetCells = currentCells.filter((cell) => Number(cell.sheet_id) === Number(currentSheet.id))
          .sort((a, b) => Number(b.col_no) - Number(a.col_no) || Number(b.row_no) - Number(a.row_no));
        const priorByRow = new Map(sheetCells.filter((cell) => Number(cell.col_no) === prevCol + 1).map((cell) => [Number(cell.row_no), cell]));
        const headerRows = new Set(run.rows.map((row) => row + 1));
        for (const cell of sheetCells) {
          if (Number(cell.col_no) >= insertCol + 1) {
            await connection.query(
              "UPDATE statistical_cells SET col_no = col_no + 1 WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
              [currentSheet.id, cell.row_no, cell.col_no]
            );
            cell.col_no = Number(cell.col_no) + 1;
          }
        }
        const [allModuleFormulas] = await connection.query(
          `SELECT c.*, s.nama AS sheet_name
             FROM statistical_cells c JOIN statistical_sheets s ON s.id = c.sheet_id
            WHERE s.module_key = ? AND c.formula IS NOT NULL`,
          [module.module_key]
        );
        for (const formulaCell of allModuleFormulas) {
          const sameSheet = Number(formulaCell.sheet_id) === Number(currentSheet.id);
          const pattern = /(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_. ]*))!)?(\$?[A-Z]{1,3}\$?\d+)/gi;
          formulaCell.formula = formulaCell.formula.replace(pattern, (reference, quoted, plain) => {
            const referredName = quoted ? quoted.replace(/''/g, "'") : plain;
            if (!sameSheet && (!referredName || referredName.trim().toUpperCase() !== currentSheet.nama.trim().toUpperCase())) return reference;
            const address = reference.slice(reference.lastIndexOf("!") + 1);
            const refMatch = /^(\$?)([A-Z]{1,3})(\$?)(\d+)$/i.exec(address);
            if (!refMatch || engine.colIndex(refMatch[2]) < insertCol) return reference;
            const shifted = `${refMatch[1]}${engine.colName(engine.colIndex(refMatch[2]) + 1)}${refMatch[3]}${refMatch[4]}`;
            return reference.slice(0, reference.lastIndexOf("!") + 1) + shifted;
          });
          await connection.query(
            "UPDATE statistical_cells SET formula = ? WHERE sheet_id = ? AND row_no = ? AND col_no = ?",
            [formulaCell.formula, formulaCell.sheet_id, formulaCell.row_no, formulaCell.col_no]
          );
        }
        for (let rowNo = 1; rowNo <= Number(currentSheet.max_row); rowNo++) {
          const prior = priorByRow.get(rowNo);
          if (headerRows.has(rowNo)) {
            const isFormula = prior && prior.jenis === "formula";
            if (isFormula && (prior.external_formula || prior.formula_fallback)) {
              throw Object.assign(new Error(`Header tahun pada sheet "${sheet.nama}" bergantung pada rumus yang tidak dapat dihitung ulang.`), { status: 422 });
            }
            const formula = isFormula ? engine.shiftFormulaRefs(prior.formula, 0, 1) : null;
            const value = isFormula ? null : priorYear + 1;
            const kind = isFormula ? "formula" : "static";
            await connection.query(
              `INSERT INTO statistical_cells
                (sheet_id, row_no, col_no, jenis, nilai, nilai_awal, hasil, formula, formula_fallback, external_formula, number_format)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
              [currentSheet.id, rowNo, insertCol + 1, kind, jsonValue(value), null, isFormula ? null : jsonValue(value), formula, prior?.number_format || null]
            );
            const newKey = toFormulaKey(currentSheet.id, rowNo, insertCol + 1);
            insertedCellKeys.add(newKey);
            if (isFormula) insertedFormulaKeys.add(newKey);
            continue;
          }
          if (!prior) continue;
          if (prior.jenis === "formula") {
            if (prior.external_formula || prior.formula_fallback) {
              throw Object.assign(new Error(`Rumus tahun terakhir pada sheet "${sheet.nama}" memiliki sumber yang tidak tersedia untuk dihitung ulang. Kolom tahun baru tidak ditambahkan.`), { status: 422 });
            }
            const formula = engine.shiftFormulaRefs(prior.formula, 0, 1);
            await connection.query(
              `INSERT INTO statistical_cells
                (sheet_id, row_no, col_no, jenis, hasil, formula, number_format)
               VALUES (?, ?, ?, 'formula', NULL, ?, ?)`,
              [currentSheet.id, rowNo, insertCol + 1, formula, prior.number_format]
            );
            const newKey = toFormulaKey(currentSheet.id, rowNo, insertCol + 1);
            insertedCellKeys.add(newKey);
            insertedFormulaKeys.add(newKey);
          } else if (prior.jenis === "input") {
            await connection.query(
              `INSERT INTO statistical_cells
                (sheet_id, row_no, col_no, jenis, nilai, nilai_awal, number_format)
               VALUES (?, ?, ?, 'input', NULL, NULL, ?)`,
              [currentSheet.id, rowNo, insertCol + 1, prior.number_format]
            );
            insertedCellKeys.add(toFormulaKey(currentSheet.id, rowNo, insertCol + 1));
          }
        }
        const merges = (parseJson(currentSheet.merges) || [])
          .map((range) => shiftMergeRangeColumns(range, insertCol, engine));
        const columnWidths = parseJson(currentSheet.column_widths) || [];
        columnWidths.splice(insertCol, 0, columnWidths[insertCol - 1] || 12);
        await connection.query(
          "UPDATE statistical_sheets SET max_col = max_col + 1, merges = ?, column_widths = ? WHERE id = ?",
          [JSON.stringify(merges), JSON.stringify(columnWidths), currentSheet.id]
        );
        const [[permissionSheet]] = await connection.query(
          "SELECT kolom FROM spreadsheet WHERE id = ? FOR UPDATE",
          [currentSheet.permission_sheet_id]
        );
        if (!permissionSheet) throw new Error(`Konfigurasi izin untuk sheet "${sheet.nama}" tidak ditemukan.`);
        const columns = parseJson(permissionSheet.kolom) || [];
        if (!Array.isArray(columns)) throw new Error(`Konfigurasi kolom izin untuk sheet "${sheet.nama}" tidak valid.`);
        const previousColumn = engine.colName(insertCol - 1);
        const newColumn = engine.colName(insertCol);
        const templateColumn = columns.find((column) => column.key === previousColumn) || {};
        columns.splice(insertCol, 0, { ...templateColumn, key: newColumn, label: newColumn, type: "number" });
        await connection.query(
          "UPDATE spreadsheet SET kolom = ? WHERE id = ?",
          [JSON.stringify(columns), currentSheet.permission_sheet_id]
        );
        }
        selectedRuns.forEach((run, index) => {
          const finalCol = run.endCol + 1 + selectedRuns.length - index - 1;
          inserted.push({ sheet: sheet.nama, year: run.lastYear + 1, column: engine.colName(finalCol) });
        });
      }
      if (!inserted.length) {
        throw Object.assign(new Error("Tidak ditemukan rentang tahun berurutan yang aman untuk diperpanjang pada modul ini."), { status: 422 });
      }
      const { sheets: moduleSheets, cells: moduleCells } = await loadModuleState(connection, module.module_key, true);
      const dependents = buildDependents(moduleCells, moduleSheets, engine);
      const yearTargets = new Set(insertedFormulaKeys);
      for (const key of insertedCellKeys) {
        for (const formulaKey of affectedFormulaKeys(key, dependents)) yearTargets.add(formulaKey);
      }
      const results = await recalculateAndSave(connection, module.module_key, moduleSheets, moduleCells, yearTargets, engine);
      await connection.commit();
      res.json({ message: "Tahun baru ditambahkan", sheets: inserted, recalculated: results.length });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Gagal membatalkan transaksi penambahan tahun:", rollbackError);
      }
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    } finally {
      connection.release();
    }
  });

  router.post("/modules/:moduleKey/reset", async (req, res, next) => {
    const connection = await db.getConnection();
    try {
      if (req.user.role !== "super_admin") {
        return res.status(403).json({ error: "Hanya Super Admin yang dapat mereset angka modul" });
      }
      await connection.beginTransaction();
      await connection.query(
        "SELECT module_key FROM statistical_modules WHERE module_key = ? FOR UPDATE",
        [req.params.moduleKey]
      );
      const { sheets, cells } = await loadModuleState(connection, req.params.moduleKey, true);
      if (!sheets.length) {
        await connection.rollback();
        return res.status(404).json({ error: "Modul statistik tidak ditemukan" });
      }
      await connection.query(
        `UPDATE statistical_cells c
         JOIN statistical_sheets s ON s.id = c.sheet_id
            SET c.nilai = c.nilai_awal, c.versi = c.versi + 1, c.updated_by = ?
          WHERE s.module_key = ? AND c.jenis = 'input'`,
        [req.user.id, req.params.moduleKey]
      );
      for (const cell of cells) {
        if (cell.jenis === "input") cell.nilai = cell.nilai_awal;
      }
      const formulas = new Set(
        cells.filter((cell) => cell.jenis === "formula" && !cell.external_formula)
          .map((cell) => toFormulaKey(cell.sheet_id, cell.row_no, cell.col_no))
      );
      const recalculated = await recalculateAndSave(connection, req.params.moduleKey, sheets, cells, formulas, engine);
      await connection.commit();
      res.json({ message: "Angka input dikembalikan ke nilai awal template", recalculated: recalculated.length });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Gagal membatalkan transaksi reset statistik:", rollbackError);
      }
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    } finally {
      connection.release();
    }
  });

  return router;
}

module.exports = {
  MODULES,
  createStatisticalRouter,
  initializeStatisticalWorkbooks,
  setStatisticalWriteAccessCheck,
  parseLocaleNumber,
  findYearRuns,
};
