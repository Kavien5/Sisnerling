import React from "react";
import { api } from "../api.js";
import { ShareDialog } from "../components/CollabPanels.jsx";
import "./StatisticalSpreadsheet.css";

const cellKey = (row, col) => `${row}:${col}`;

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 15 }).format(value);
  }
  if (value && typeof value === "object" && value.$date) {
    return new Date(value.$date).toLocaleDateString("id-ID");
  }
  return String(value);
}

function yearNumber(cell) {
  const value = cell?.value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1800 && value <= 2199) return value;
  const match = /^((?:18|19|20|21)\d{2})\*{0,2}$/.exec(String(value ?? "").trim());
  return match ? Number(match[1]) : null;
}

function findYearBlocks(cells) {
  const rows = new Map();
  for (const cell of cells) {
    const row = rows.get(cell.row) || new Map();
    row.set(cell.col, cell);
    rows.set(cell.row, row);
  }

  const blocks = new Map();
  for (const [rowNo, row] of rows) {
    const entries = [...row.entries()].sort(([left], [right]) => left - right);
    let run = [];
    const addRun = () => {
      if (run.length >= 3) {
        const first = run[0];
        const last = run[run.length - 1];
        const key = `${first.col}:${last.col}:${first.year}:${last.year}`;
        const block = blocks.get(key) || {
          startCol: first.col,
          endCol: last.col,
          firstYear: first.year,
          lastYear: last.year,
          headerRows: [],
        };
        block.headerRows.push(rowNo);
        blocks.set(key, block);
      }
      run = [];
    };

    for (const [col, cell] of entries) {
      const year = yearNumber(cell);
      const previous = run[run.length - 1];
      if (year !== null && (!previous || (col === previous.col + 1 && year === previous.year + 1))) {
        run.push({ col, year });
      } else {
        addRun();
        if (year !== null) run.push({ col, year });
      }
    }
    addRun();
  }

  return [...blocks.values()].sort((left, right) => left.startCol - right.startCol);
}

function buildStructuredTables(sheet, cells) {
  const blocks = findYearBlocks(cells);
  const cellsByKey = new Map(cells.map((cell) => [cellKey(cell.row, cell.col), cell]));
  const rowNumbers = cells.map((cell) => cell.row);
  if (!rowNumbers.length) return [];
  const firstRow = Math.min(...rowNumbers);
  const lastRow = Math.max(...rowNumbers);
  if (!blocks.length) {
    const columnCount = Math.max(...cells.map((cell) => cell.col));
    const populatedRows = new Map();
    for (const cell of cells) {
      const row = populatedRows.get(cell.row) || [];
      row.push(cell);
      populatedRows.set(cell.row, row);
    }
    const headingRow = [...populatedRows.entries()]
      .map(([rowNo, row]) => ({
        rowNo,
        score: row.filter((cell) => typeof cell.value === "string" && cell.value.trim()).length,
      }))
      .sort((left, right) => right.score - left.score || left.rowNo - right.rowNo)[0]?.rowNo;
    const columns = Array.from({ length: columnCount }, (_, index) => {
      const sourceName = formatValue(cellsByKey.get(cellKey(headingRow, index + 1))?.value).trim();
      const label = /^description$/i.test(sourceName) || /^perincian$/i.test(sourceName)
        ? "Komponen / Indikator"
        : /^unit$/i.test(sourceName)
          ? "Satuan"
          : sourceName || (index === 0 ? "Komponen / Indikator" : `Parameter ${index + 1}`);
      return { sourceCol: index + 1, label };
    });
    if (!columns.some((column) => column.label.toLowerCase() === "satuan")) {
      columns.push({ key: "unit", label: "Satuan" });
    }
    columns.push({ key: "kind", label: "Tipe Sel" });
    const rows = [];
    for (let rowNo = headingRow + 1; rowNo <= lastRow; rowNo++) {
      const rowCells = populatedRows.get(rowNo) || [];
      const values = Array.from({ length: columnCount }, (_, index) =>
        cellsByKey.get(cellKey(rowNo, index + 1))?.value
      );
      if (!values.some((value) => formatValue(value).trim())) continue;
      const kinds = new Set(rowCells.map((cell) => cell.kind));
      const typeLabel = kinds.has("input") && kinds.has("formula")
        ? "Campuran"
        : kinds.has("formula")
          ? "Formula"
          : kinds.has("input")
            ? "Input"
            : "Data tetap";
      rows.push({
        rowNo,
        section: false,
        labelValues: values,
        unit: "",
        typeLabel,
        yearCells: [],
      });
    }
    return [{
      key: "parameter",
      firstYear: null,
      lastYear: null,
      startCol: null,
      columns,
      rows,
    }];
  }

  const identifierColumnCount = Math.min(...blocks.map((block) => block.startCol)) - 1;

  return blocks.map((block) => {
    const headerRows = new Set(block.headerRows);
    const headingRow = block.headerRows
      .map((rowNo) => ({
        rowNo,
        score: Array.from({ length: identifierColumnCount }, (_, index) => {
          const value = formatValue(cellsByKey.get(cellKey(rowNo, index + 1))?.value).trim();
          if (!value) return 0;
          return /^(no\.?|description|unit|perincian|indikator|komponen)$/i.test(value) ? 2 : 1;
        }).reduce((total, score) => total + score, 0),
      }))
      .sort((left, right) => right.score - left.score || left.rowNo - right.rowNo)[0]?.rowNo;

    const columns = Array.from({ length: identifierColumnCount }, (_, index) => {
      const sourceName = formatValue(cellsByKey.get(cellKey(headingRow, index + 1))?.value).trim();
      const normalizedName = /^description$/i.test(sourceName) || /^perincian$/i.test(sourceName)
        ? "Komponen / Indikator"
        : /^unit$/i.test(sourceName)
          ? "Satuan"
          : sourceName || (index === 0 ? "Komponen / Indikator" : `Keterangan ${index + 1}`);
      return { sourceCol: index + 1, label: normalizedName };
    });
    if (!columns.some((column) => column.label.toLowerCase() === "satuan")) {
      columns.push({ key: "unit", label: "Satuan" });
    }
    columns.push({ key: "kind", label: "Tipe Sel" });

    let currentUnit = "";
    const rows = [];
    for (let rowNo = Math.max(firstRow, Math.min(...block.headerRows)); rowNo <= lastRow; rowNo++) {
      if (headerRows.has(rowNo)) continue;
      const labelValues = Array.from({ length: identifierColumnCount }, (_, index) =>
        cellsByKey.get(cellKey(rowNo, index + 1))?.value
      );
      const yearCells = Array.from(
        { length: block.endCol - block.startCol + 1 },
        (_, index) => cellsByKey.get(cellKey(rowNo, block.startCol + index))
      );
      const hasYearCells = yearCells.some((cell) => cell && (cell.kind === "input" || cell.kind === "formula"));
      const hasLabels = labelValues.some((value) => formatValue(value).trim() !== "");
      const hasYearValues = yearCells.some((cell) => cell?.value !== null && cell?.value !== undefined && cell?.value !== "");
      if (!hasLabels && !hasYearValues) continue;

      const labelText = labelValues.map((value) => formatValue(value).trim()).filter(Boolean).join(" ");
      const sectionRow = !hasYearCells && hasLabels;
      const unitMatch = sectionRow ? /\(([^()]+)\)/.exec(labelText) : null;
      if (unitMatch) currentUnit = unitMatch[1].trim();

      const kinds = new Set(yearCells.filter(Boolean).map((cell) => cell.kind));
      const typeLabel = kinds.has("input") && kinds.has("formula")
        ? "Campuran"
        : kinds.has("formula")
          ? "Formula"
          : kinds.has("input")
            ? "Input"
            : "Data tetap";

      rows.push({
        rowNo,
        section: sectionRow,
        labelText,
        labelValues,
        unit: currentUnit,
        typeLabel,
        yearCells,
      });
    }

    return {
      key: `${block.startCol}-${block.endCol}`,
      firstYear: block.firstYear,
      lastYear: block.lastYear,
      startCol: block.startCol,
      columns,
      rows,
    };
  });
}

function downloadCsv(sheet, cells) {
  const values = new Map(cells.map((cell) => [cellKey(cell.row, cell.col), cell.value]));
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = Array.from({ length: sheet.rows }, (_, rowIndex) =>
    Array.from({ length: sheet.columns }, (_, colIndex) =>
      quote(values.get(cellKey(rowIndex + 1, colIndex + 1)) ?? "")
    ).join(",")
  );
  const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sheet.name.replace(/[<>:"/\\|?*]/g, "_")}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StatisticalSpreadsheet({ user }) {
  const [modules, setModules] = React.useState([]);
  const [moduleKey, setModuleKey] = React.useState("");
  const [group, setGroup] = React.useState("primary");
  const [sheetMeta, setSheetMeta] = React.useState(null);
  const [cells, setCells] = React.useState([]);
  const [drafts, setDrafts] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(new Set());
  const [saveState, setSaveState] = React.useState({ type: "idle", text: "Status penyimpanan belum tersedia" });
  const [error, setError] = React.useState("");
  const [darkMode, setDarkMode] = React.useState(false);
  const [showShares, setShowShares] = React.useState(false);
  const [shares, setShares] = React.useState([]);
  const cancelBlurSave = React.useRef(false);
  const [showAllSheets, setShowAllSheets] = React.useState(false);
  const selectedModule = modules.find((module) => module.key === moduleKey);
  const selectedSheet = selectedModule?.sheets.find((sheet) => sheet.id === sheetMeta?.id);
  const canManage = user?.role === "super_admin";
  const access = selectedModule?.access;

  const loadModules = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.statisticalModules();
      setModules(result);
      setModuleKey((current) => result.some((module) => module.key === current) ? current : result[0]?.key || "");
    } catch (cause) {
      setError(cause.message || "Modul statistik gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadModules();
  }, [loadModules]);

  React.useEffect(() => {
    const sheets = selectedModule?.sheets || [];
    const visible = sheets.filter((sheet) => {
      if (group === "primary") return sheet.primary;
      if (group === "parameters") return sheet.parameter;
      if (group === "other") return !sheet.primary && !sheet.parameter;
      return true;
    });
    const available = showAllSheets ? visible : visible.slice(0, 6);
    if (!available.some((sheet) => sheet.id === sheetMeta?.id) && available[0]) {
      setSheetMeta((current) => current?.id === available[0].id ? current : { id: available[0].id });
    }
  }, [selectedModule, group, showAllSheets, sheetMeta?.id]);

  const loadSheet = React.useCallback(async (targetSheetId) => {
    if (!moduleKey || !targetSheetId) return;
    setLoading(true);
    setSaveState({ type: "saving", text: "Memuat data dari database…" });
    setError("");
    setDrafts({});
    try {
      const result = await api.statisticalSheet(moduleKey, targetSheetId);
      setSheetMeta(result.sheet);
      setCells(result.cells);
      setSaveState({ type: "saved", text: "Data terbaru berhasil dimuat dari database" });
    } catch (cause) {
      setError(cause.message || "Data tabel gagal dimuat.");
      setCells([]);
      setSaveState({ type: "failed", text: "Data gagal dimuat" });
    } finally {
      setLoading(false);
    }
  }, [moduleKey]);

  React.useEffect(() => {
    if (sheetMeta?.id && selectedModule?.sheets.some((sheet) => sheet.id === sheetMeta.id)) {
      loadSheet(sheetMeta.id);
    }
  }, [moduleKey, sheetMeta?.id, loadSheet, selectedModule]);

  const setCellDraft = (key, value) => setDrafts((current) => ({ ...current, [key]: value }));

  const saveCell = async (cell) => {
    const key = cellKey(cell.row, cell.col);
    if (cell.kind !== "input" || !(key in drafts) || saving.has(key)) return;
    const value = drafts[key];
    if (String(value ?? "").trim() === "" && (cell.value === null || cell.value === undefined)) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    setSaving((current) => new Set([...current, key]));
    setSaveState({ type: "saving", text: "Menyimpan perubahan…" });
    setError("");
    try {
      const result = await api.statisticalUpdateCell({
        sheet_id: sheetMeta.id,
        row: cell.row,
        col: cell.col,
        value,
        base_version: cell.version,
      });
      const updates = new Map((result.recalculated || [])
        .filter((item) => item.sheet_id === sheetMeta.id)
        .map((item) => [
        cellKey(item.row, item.col),
        item.value,
      ]));
      setCells((current) => current.map((item) => {
        const itemKey = cellKey(item.row, item.col);
        if (itemKey === key) return { ...item, value: result.cell.value, version: result.cell.version };
        return updates.has(itemKey) ? { ...item, value: updates.get(itemKey) } : item;
      }));
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setSaveState({ type: "saved", text: "Semua perubahan tersimpan" });
    } catch (cause) {
      setSaveState({ type: "failed", text: "Penyimpanan gagal" });
      setError(cause.message || "Nilai tidak berhasil disimpan.");
      if (cause.status === 409) await loadSheet(sheetMeta.id);
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const chooseGroup = (nextGroup) => {
    setGroup(nextGroup);
    setShowAllSheets(nextGroup === "all");
    setSheetMeta(null);
  };

  const addYear = async () => {
    if (!sheetMeta || !window.confirm(`Tambahkan tahun berikutnya pada lembar "${sheetMeta.name}"?`)) return;
    setSaveState({ type: "saving", text: "Menyiapkan kolom tahun baru…" });
    setError("");
    try {
      await api.statisticalAddYear(moduleKey, sheetMeta.id);
      await loadModules();
      if (sheetMeta?.id) await loadSheet(sheetMeta.id);
      setSaveState({ type: "saved", text: "Tahun baru berhasil ditambahkan" });
    } catch (cause) {
      setError(cause.message || "Tahun baru gagal ditambahkan.");
      setSaveState({ type: "failed", text: "Penambahan tahun gagal" });
    }
  };

  const resetModule = async () => {
    if (!window.confirm(`Reset semua angka input di "${selectedModule.name}" ke nilai awal template? Tindakan ini tidak dapat dibatalkan.`)) return;
    setSaveState({ type: "saving", text: "Mengembalikan angka awal…" });
    setError("");
    try {
      await api.statisticalReset(moduleKey);
      if (sheetMeta?.id) await loadSheet(sheetMeta.id);
      setSaveState({ type: "saved", text: "Angka berhasil dikembalikan ke nilai awal" });
    } catch (cause) {
      setError(cause.message || "Reset gagal.");
      setSaveState({ type: "failed", text: "Reset gagal" });
    }
  };

  const openShares = async () => {
    if (!selectedModule) return;
    try {
      setShares(await api.collabShares(selectedModule.workbookKey));
      setShowShares(true);
    } catch (cause) {
      setError(cause.message || "Daftar akses modul gagal dimuat.");
    }
  };

  const refreshShares = async () => {
    if (!selectedModule) return;
    setShares(await api.collabShares(selectedModule.workbookKey));
  };

  const exportCsv = async () => {
    if (!sheetMeta) return;
    try {
      const latest = await api.statisticalSheet(moduleKey, sheetMeta.id);
      downloadCsv(latest.sheet, latest.cells);
    } catch (cause) {
      setError(cause.message || "Ekspor gagal.");
    }
  };

  const visibleSheets = (selectedModule?.sheets || []).filter((sheet) => {
    if (group === "primary") return sheet.primary;
    if (group === "parameters") return sheet.parameter;
    if (group === "other") return !sheet.primary && !sheet.parameter;
    return true;
  });
  const shownSheets = showAllSheets ? visibleSheets : visibleSheets.slice(0, 6);
  const structuredTables = sheetMeta ? buildStructuredTables(sheetMeta, cells) : [];

  return (
    <section className={`stat-page${darkMode ? " stat-dark" : ""}`}>
      <header className="stat-header">
        <div>
          <div className="stat-eyebrow">PENGOLAHAN DATA STATISTIK</div>
          <h1>Spreadsheet Statistik</h1>
          <p>Data input disimpan bersama dan indikator formula dihitung otomatis oleh sistem.</p>
        </div>
        <div className="stat-actions">
          <button className="stat-secondary" onClick={() => setDarkMode((mode) => !mode)} aria-label="Ubah mode gelap">
            {darkMode ? "☀️" : "🌙"} Tema
          </button>
          <button className="stat-secondary" onClick={exportCsv} disabled={!sheetMeta}>
            Unduh CSV
          </button>
          {canManage && <button className="stat-secondary" onClick={openShares} disabled={!selectedModule}>Bagikan Modul</button>}
          {canManage && <>
            <button className="stat-secondary" onClick={addYear} disabled={!sheetMeta}>Tambah Tahun</button>
            <button className="stat-danger" onClick={resetModule} disabled={!selectedModule}>Reset Angka</button>
          </>}
        </div>
      </header>

      <div className={`stat-save-status stat-${saveState.type}`} role="status">
        <span className="stat-status-dot" />
        {saveState.text || "Perubahan tersimpan pada database"}
        {access && <span className="stat-access-label">{access.write ? "Dapat mengedit" : "Baca saja"}</span>}
      </div>

      {error && <div className="stat-error" role="alert">{error}</div>}
      {loading && <div className="stat-loading">Memuat tabel statistik…</div>}
      {!loading && !modules.length && !error && (
        <div className="stat-empty">Belum ada modul yang dibagikan ke akun ini.</div>
      )}

      {!!modules.length && <>
        <div className="stat-toolbar">
          <label htmlFor="stat-module">Modul data</label>
          <select id="stat-module" value={moduleKey} onChange={(event) => {
            setModuleKey(event.target.value);
            setSheetMeta(null);
            setGroup("primary");
          }}>
            {modules.map((module) => <option key={module.key} value={module.key}>{module.name}</option>)}
          </select>
          <span>Perubahan angka input langsung disimpan setelah dikonfirmasi.</span>
        </div>

        <nav className="stat-category-tabs" aria-label="Kategori tabel statistik">
          {[
            ["primary", "Lembar Utama"],
            ["parameters", "Data Penunjang & Parameter"],
            ["other", "Lembar Lainnya"],
            ["all", "Semua Lembar"],
          ].map(([key, label]) => (
            <button key={key} className={group === key ? "active" : ""} onClick={() => chooseGroup(key)}>{label}</button>
          ))}
        </nav>

        <nav className="stat-sheet-tabs" aria-label="Lembar dalam modul">
          {shownSheets.map((sheet) => (
            <button
              key={sheet.id}
              className={sheet.id === sheetMeta?.id ? "active" : ""}
              onClick={() => setSheetMeta({ id: sheet.id })}
            >
              {sheet.name}
            </button>
          ))}
          {!showAllSheets && visibleSheets.length > 6 &&
            <button className="stat-more" onClick={() => setShowAllSheets(true)}>Lihat semua ({visibleSheets.length})</button>}
        </nav>

        {sheetMeta && selectedSheet && (
          <div className="stat-table-heading">
            <div>
              <h2>{sheetMeta.name}</h2>
              <span>Tabel indikator terstruktur · biru menandai hasil formula · input disimpan otomatis</span>
            </div>
            <button className="stat-secondary" onClick={() => loadSheet(sheetMeta.id)}>Muat ulang</button>
          </div>
        )}

        {structuredTables.map((table) => {
          const yearCount = table.firstYear === null ? 0 : table.lastYear - table.firstYear + 1;
          const totalColumns = table.columns.length + yearCount;
          return (
            <section className="stat-table-card" key={table.key}>
              <div className="stat-table-card-heading">
                <div>
                  <strong>{yearCount ? "Data tahunan" : "Data penunjang"}</strong>
                  {yearCount > 0 && <span>{table.firstYear}–{table.lastYear}</span>}
                </div>
                <div className="stat-cell-legend">
                  <span><i className="stat-legend-input" /> Input</span>
                  <span><i className="stat-legend-formula" /> Formula otomatis</span>
                </div>
              </div>
              <div className="stat-table-scroll">
                <table
                  className="stat-table stat-structured-table"
                  style={{
                    "--stat-first-col-width": table.columns[0]?.label === "No." ? "64px" : "280px",
                    "--stat-second-col-width": table.columns[1]?.label === "Komponen / Indikator" ? "280px" : "120px",
                  }}
                >
                  <colgroup>
                    {table.columns.map((column, index) => (
                      <col
                        key={column.key || column.sourceCol}
                        className={column.key ? `stat-column-${column.key}` : `stat-column-source-${index}`}
                        style={{
                          width: column.key === "kind" ? "110px"
                            : column.key === "unit" || column.label === "Satuan" ? "120px"
                              : column.label === "No." ? "64px"
                                : column.label === "Komponen / Indikator" ? "280px" : "160px",
                        }}
                      />
                    ))}
                    {Array.from({ length: yearCount }, (_, index) => (
                      <col key={`year-${index}`} className="stat-column-year" style={{ width: "124px" }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {table.columns.map((column, index) => (
                        <th
                          key={column.key || column.sourceCol}
                          className={index < 2 && column.sourceCol ? `stat-sticky-col stat-sticky-${index}` : ""}
                        >
                          {column.label}
                        </th>
                      ))}
                      {Array.from({ length: yearCount }, (_, index) => (
                        <th key={table.firstYear + index}>{table.firstYear + index}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) => {
                      if (row.section) {
                        return (
                          <tr className="stat-section-row" key={`section-${row.rowNo}`}>
                            <th colSpan={totalColumns}>{row.labelText}</th>
                          </tr>
                        );
                      }
                      return (
                        <tr key={row.rowNo}>
                          {table.columns.map((column, index) => {
                            if (column.key === "unit") {
                              return <td key={column.key} className="stat-unit-value">{row.unit || "—"}</td>;
                            }
                            if (column.key === "kind") {
                              const typeKey = row.typeLabel.toLowerCase().replace(/\s+/g, "-");
                              return <td key={column.key}><span className={`stat-kind stat-kind-${typeKey}`}>{row.typeLabel}</span></td>;
                            }
                            return (
                              <td
                                key={column.key || column.sourceCol}
                                className={index < 2 ? `stat-sticky-col stat-sticky-${index}` : ""}
                              >
                                {formatValue(row.labelValues[column.sourceCol - 1])}
                              </td>
                            );
                          })}
                          {row.yearCells.map((cell, index) => {
                            const colNo = table.startCol + index;
                            const key = cellKey(row.rowNo, colNo);
                            const value = cell?.kind === "input" && key in drafts
                              ? drafts[key]
                              : formatValue(cell?.value);
                            const editable = cell?.kind === "input" && !!access?.write;
                            return (
                              <td
                                key={table.firstYear + index}
                                className={cell?.kind === "formula" ? "stat-formula-cell" : cell?.kind === "input" ? "stat-input-cell" : ""}
                              >
                                {editable ? (
                                  <input
                                    aria-label={`${sheetMeta.name} ${row.labelText} ${table.firstYear + index}`}
                                    inputMode="decimal"
                                    value={value}
                                    onChange={(event) => setCellDraft(key, event.target.value)}
                                    onBlur={() => {
                                      if (cancelBlurSave.current) {
                                        cancelBlurSave.current = false;
                                        return;
                                      }
                                      saveCell(cell);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") event.currentTarget.blur();
                                      if (event.key === "Escape") {
                                        cancelBlurSave.current = true;
                                        setDrafts((current) => {
                                          const next = { ...current };
                                          delete next[key];
                                          return next;
                                        });
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    disabled={saving.has(key)}
                                  />
                                ) : (
                                  <span className={cell?.kind === "formula" ? "stat-formula-value" : ""}>
                                    {value}
                                    {cell?.kind === "formula" && <span className="stat-formula-badge" title="Dihitung otomatis">ƒ</span>}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {sheetMeta && !structuredTables.length && (
          <div className="stat-empty">Lembar ini tidak memiliki deret tahun yang bisa ditampilkan sebagai tabel statistik.</div>
        )}
      </>}
      {showShares && selectedModule && (
        <ShareDialog
          shares={shares}
          canManage={canManage}
          onGrant={async (email, peran) => {
            try {
              await api.collabGrant(selectedModule.workbookKey, { email, peran });
              await refreshShares();
            } catch (cause) {
              setError(cause.message || "Akses tidak berhasil diberikan.");
            }
          }}
          onSet={async (userId, peran) => {
            try {
              await api.collabSetShare(selectedModule.workbookKey, userId, { peran });
              await refreshShares();
            } catch (cause) {
              setError(cause.message || "Akses tidak berhasil diubah.");
            }
          }}
          onRevoke={async (userId) => {
            try {
              await api.collabRevokeShare(selectedModule.workbookKey, userId);
              await refreshShares();
            } catch (cause) {
              setError(cause.message || "Akses tidak berhasil dicabut.");
            }
          }}
          onClose={() => setShowShares(false)}
        />
      )}
    </section>
  );
}
