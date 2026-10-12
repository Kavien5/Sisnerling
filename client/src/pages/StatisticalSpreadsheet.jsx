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

function columnName(index) {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function parseMerge(range) {
  const match = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(range);
  if (!match) return null;
  const colIndex = (letters) => [...letters.toUpperCase()].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0
  );
  return {
    row: Number(match[2]),
    col: colIndex(match[1]),
    rowEnd: Number(match[4]),
    colEnd: colIndex(match[3]),
  };
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
  const cellsByKey = new Map(cells.map((cell) => [cellKey(cell.row, cell.col), cell]));
  const mergedRanges = (sheetMeta?.merges || []).map(parseMerge).filter(Boolean);
  const mergeMasters = new Map();
  const mergedChildren = new Set();
  for (const range of mergedRanges) {
    mergeMasters.set(cellKey(range.row, range.col), range);
    for (let row = range.row; row <= range.rowEnd; row++) {
      for (let col = range.col; col <= range.colEnd; col++) {
        if (row !== range.row || col !== range.col) mergedChildren.add(cellKey(row, col));
      }
    }
  }

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
              <span>{sheetMeta.rows.toLocaleString("id-ID")} baris · {sheetMeta.columns} kolom · biru menandai hasil formula</span>
            </div>
            <button className="stat-secondary" onClick={() => loadSheet(sheetMeta.id)}>Muat ulang</button>
          </div>
        )}

        {sheetMeta && (
          <div className="stat-table-scroll">
                <table
                  className="stat-table"
                  style={{ "--stat-first-col-width": `${Math.max(82, Math.min(280, (sheetMeta.columnWidths?.[0] || 12) * 9))}px` }}
                >
              <colgroup>
                {Array.from({ length: sheetMeta.columns }, (_, col) => (
                  <col key={col} style={{ width: `${Math.max(82, Math.min(280, (sheetMeta.columnWidths?.[col] || 12) * 9))}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {Array.from({ length: sheetMeta.columns }, (_, col) => (
                    <th key={col} className={col < 2 ? `stat-sticky-col stat-sticky-${col}` : ""}>{columnName(col + 1)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: sheetMeta.rows }, (_, rowIndex) => {
                  const rowNo = rowIndex + 1;
                  const headerIndex = (sheetMeta.headerRows || []).indexOf(rowNo);
                  return (
                    <tr key={rowNo} className={headerIndex >= 0 ? "stat-year-header-row" : ""}>
                      {Array.from({ length: sheetMeta.columns }, (_, colIndex) => {
                        const colNo = colIndex + 1;
                        const key = cellKey(rowNo, colNo);
                        if (mergedChildren.has(key)) return null;
                        const cell = cellsByKey.get(key);
                        const merge = mergeMasters.get(key);
                        const value = cell?.kind === "input" && key in drafts
                          ? drafts[key]
                          : formatValue(cell?.value);
                        const editable = cell?.kind === "input" && !!access?.write;
                        const classNames = [
                          cell?.kind === "formula" ? "stat-formula-cell" : "",
                          cell?.kind === "input" ? "stat-input-cell" : "",
                          colIndex < 2 ? `stat-sticky-col stat-sticky-${colIndex}` : "",
                        ].filter(Boolean).join(" ");
                        return (
                          <td
                            key={key}
                            className={classNames}
                            rowSpan={merge ? merge.rowEnd - merge.row + 1 : undefined}
                            colSpan={merge ? merge.colEnd - merge.col + 1 : undefined}
                            style={{
                              ...(sheetMeta.rowHeights?.[rowIndex] ? { height: `${sheetMeta.rowHeights[rowIndex]}px` } : {}),
                              ...(headerIndex >= 0 ? { top: `${34 + headerIndex * 34}px` } : {}),
                            }}
                          >
                            {editable ? (
                              <input
                                aria-label={`${sheetMeta.name} ${columnName(colNo)}${rowNo}`}
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
