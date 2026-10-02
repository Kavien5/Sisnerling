import React from "react";
import * as XLSX from "xlsx-js-style";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
import PerbandinganData from "../components/PerbandinganData.jsx";
import { workbookToSheets, autoFitSheet } from "../excelImportUtil.js";
import { formatCellValue } from "../spreadsheet.js";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
);

const CHART_TYPES = [
  { value: "bar", label: "Bar Chart" },
  { value: "line", label: "Line Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "doughnut", label: "Doughnut Chart" },
  { value: "area", label: "Area Chart" },
];

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#a855f7", "#f43f5e", "#84cc16", "#0ea5e9", "#6d28d9",
];

function toNum(v) {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  if (v instanceof Date) return NaN;
  if (typeof v === "string") {
    let s = v.trim();
    if (s === "") return NaN;
    s = s.replace(/[Rp\$€£¥\s]/g, "");
    s = s.replace(/\.(?=\d{3})/g, "");
    s = s.replace(",", ".");
    s = s.replace(/[^0-9.\-+]/g, "");
    if (s === "" || s === "." || s === "-") return NaN;
    return Number(s);
  }
  return NaN;
}

function detectColumnType(values) {
  let numCount = 0, dateCount = 0, textCount = 0;
  const sample = values.filter((v) => v !== null && v !== undefined && v !== "").slice(0, 80);
  if (sample.length === 0) return "text";
  for (const v of sample) {
    if (v instanceof Date) { dateCount++; }
    else if (typeof v === "number") { numCount++; }
    else if (typeof v === "string" && v.trim() !== "") {
      const t = v.trim();
      if (!isNaN(toNum(t))) numCount++;
      else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(t)) dateCount++;
      else textCount++;
    }
  }
  const total = sample.length;
  if (numCount >= total * 0.25 && numCount > dateCount && numCount > textCount) return "number";
  if (dateCount >= total * 0.25 && dateCount > numCount && dateCount > textCount) return "date";
  return "text";
}

function formatNum(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (Number.isInteger(n)) return n.toLocaleString("id-ID");
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function ExcelResult({ importedData, allFiles, activeFileId, onSelectFile, onRemoveFile, onImportMore }) {
  const { workbook, sheetNames, fileName } = importedData;
  const [activeSheet, setActiveSheet] = React.useState(sheetNames[0] || "");
  const [headers, setHeaders] = React.useState([]);
  const [rows, setRows] = React.useState([]);
  const [headerColors, setHeaderColors] = React.useState([]);
  const [rowColors, setRowColors] = React.useState([]);
  const [colTypes, setColTypes] = React.useState({});
  const [colWidths, setColWidths] = React.useState([]);
  const [rowHeights, setRowHeights] = React.useState([]);
  const [rowNfs, setRowNfs] = React.useState([]);
  const [merges, setMerges] = React.useState([]);
  const [chartX, setChartX] = React.useState("");
  const [chartY, setChartY] = React.useState([]);
  const [chartType, setChartType] = React.useState("bar");
  const [chartKey, setChartKey] = React.useState(0);
  const [confirmDelete, setConfirmDelete] = React.useState(null);

  React.useEffect(() => {
    setActiveSheet(sheetNames[0] || "");
  }, [fileName, sheetNames]);

  const sheetsMemo = React.useMemo(
    () => (workbook ? workbookToSheets(workbook, { native: true }) : []),
    [workbook]
  );

  React.useEffect(() => {
    if (!workbook || !activeSheet) return;
    const sheetIdx = sheetNames.indexOf(activeSheet);
    const reset = () => {
      setHeaders([]); setRows([]); setHeaderColors([]); setRowColors([]); setColTypes({}); setChartX(""); setChartY([]);
      setColWidths([]); setRowHeights([]); setMerges([]);
    };
    if (sheetIdx < 0) { reset(); return; }
    const sh = sheetsMemo[sheetIdx];
    if (!sh) { reset(); return; }

    // Sheet impor (native) = 1:1 dengan Excel: lebar/tinggi ikut file, semua
    // baris ditampilkan, dan format angka/persen/tanggal memakai numFmt cell
    // aslinya. Tanpa auto-filter data, tanpa memangkas 200 baris, tanpa
    // pengelompokan ribuan buatan sendiri (tahun 2008 tetap tampil "2008").
    const fitted = autoFitSheet(sh);
    const cols = fitted.columns || [];
    const headerRow = cols.map((c) => (c && c.label ? c.label : c.key));
    const dataRows = [];
    const rowCols = [];
    const rowNfsArr = [];
    for (const row of sh.rows) {
      const vals = cols.map((c) => (row[c.key] === null || row[c.key] === undefined ? "" : row[c.key]));
      dataRows.push(vals);
      rowCols.push(cols.map((c) => row["__" + c.key] || null));
      rowNfsArr.push(cols.map((c) => row["__nf_" + c.key] || c.numFmt || ""));
    }

    const types = {};
    headerRow.forEach((h, i) => { types[h] = detectColumnType(dataRows.map((r) => r[i])); });

    setHeaders(headerRow); setRows(dataRows); setHeaderColors([]); setRowColors(rowCols); setColTypes(types);
    setRowNfs(rowNfsArr);
    setColWidths(fitted.columns.map((c) => (c.width && c.width > 0 ? c.width : 80)));
    setRowHeights(fitted.rows.map((row) => (row && row.height && row.height > 0 ? row.height : 0)));
    setMerges(fitted.merges || []);

    const numCols = headerRow.filter((h) => types[h] === "number");
    const catCols = headerRow.filter((h) => types[h] === "text" || types[h] === "date");
    setChartX(catCols.length > 0 ? catCols[0] : headerRow[0] || "");
    setChartY(numCols.length > 0 ? numCols.slice(0, Math.min(numCols.length, 4)) : []);
    setChartType(numCols.length >= 2 && catCols.length === 0 ? "line" : "bar");
    setChartKey((k) => k + 1);
  }, [workbook, activeSheet, sheetNames, sheetsMemo]);

  const numericCols = React.useMemo(() => headers.filter((h) => colTypes[h] === "number"), [headers, colTypes]);
  const categoricalCols = React.useMemo(() => headers.filter((h) => colTypes[h] === "text" || colTypes[h] === "date"), [headers, colTypes]);

  const toggleChartY = (col) => {
    setChartY((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
    setChartKey((k) => k + 1);
  };

  const chartData = React.useMemo(() => {
    if (!chartX || chartY.length === 0 || rows.length === 0) return null;
    if (!headers.includes(chartX) || chartY.some((c) => !headers.includes(c))) return null;
    const xIndex = headers.indexOf(chartX);
    if (xIndex === -1) return null;

    const aggregated = {};
    const order = [];
    rows.forEach((row) => {
      const xVal = row[xIndex];
      const xKey = (xVal === null || xVal === undefined || xVal === "") ? "(Kosong)" : String(xVal).trim() || "(Kosong)";
      if (!aggregated[xKey]) { aggregated[xKey] = {}; order.push(xKey); chartY.forEach((y) => { aggregated[xKey][y] = 0; }); }
      chartY.forEach((yCol) => {
        const yIdx = headers.indexOf(yCol);
        if (yIdx !== -1) {
          const raw = row[yIdx];
          const val = typeof raw === "number" ? raw : toNum(raw);
          if (!isNaN(val)) aggregated[xKey][yCol] += val;
        }
      });
    });

    let labels = order;
    if (labels.length > 60) labels = labels.slice(0, 60);

    const isPie = chartType === "pie" || chartType === "doughnut";
    const isArea = chartType === "area";

    const datasets = chartY.map((yCol, i) => {
      const data = labels.map((l) => aggregated[l][yCol] || 0);
      const color = CHART_COLORS[i % CHART_COLORS.length];
      if (isPie) return { label: yCol, data, backgroundColor: labels.map((_, j) => CHART_COLORS[j % CHART_COLORS.length]), borderColor: "#fff", borderWidth: 2 };
      return {
        label: yCol, data,
        backgroundColor: isArea ? color + "30" : color,
        borderColor: color, borderWidth: 2, fill: isArea,
        tension: (chartType === "line" || isArea) ? 0.35 : 0,
        pointRadius: (chartType === "line" || isArea) ? 3 : 0,
        pointBackgroundColor: color, pointBorderColor: "#fff", pointBorderWidth: 1,
      };
    });

    return { labels, datasets };
  }, [headers, rows, chartX, chartY, chartType]);

  const chartOptions = React.useMemo(() => {
    const isPie = chartType === "pie" || chartType === "doughnut";
    if (isPie) return { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { padding: 14, usePointStyle: true, font: { size: 12 } } }, tooltip: { backgroundColor: "rgba(15,23,42,0.9)", padding: 10, cornerRadius: 8 } } };
    return {
      responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: "index" },
      plugins: { legend: { position: "top", labels: { usePointStyle: true, padding: 14, font: { size: 12 } } }, tooltip: { backgroundColor: "rgba(15,23,42,0.9)", titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 8 } },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.06)" }, ticks: { font: { size: 11 } } } },
    };
  }, [chartType]);

  const renderChart = () => {
    if (!chartData) return null;
    const props = { key: chartKey, data: chartData, options: chartOptions };
    switch (chartType) {
      case "bar": return <Bar {...props} />;
      case "line": return <Line {...props} />;
      case "pie": return <Pie {...props} />;
      case "doughnut": return <Doughnut {...props} />;
      case "area": return <Line {...props} />;
      default: return <Bar {...props} />;
    }
  };

  const mergeSpan = (r, c) => {
    for (const m of merges) {
      if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) {
        return { m, isAnchor: r === m.r1 && c === m.c1 };
      }
    }
    return null;
  };

  // Render sel mengikuti number format EXCEL asli (numFmt cell) — tahun 2008
  // tampil "2008", persen "9.00%", tanggal "31-Des-2008", dst. Data tidak
  // diubah; hanya tampilannya yang mengikuti format file.
  const cellText = (ri, ci) => {
    const raw = rows[ri] && rows[ri][ci];
    const nf = rowNfs[ri] && rowNfs[ri][ci];
    return formatCellValue(raw, { numFmt: nf || undefined });
  };

  const spanWidth = (ci, colSpanN) => {
    let w = 0;
    for (let k = 0; k < colSpanN; k++) w += colWidths[ci + k] || 80;
    return w;
  };

  return (
    <div className="excel-import-page">
      {/* FILE TABS */}
      <div className="file-tabs-bar">
        <div className="file-tabs-list">
          {allFiles.map((f) => (
            <div key={f.id} className={`file-tab${f.id === activeFileId ? " active" : ""}`}>
              <button className="file-tab-name" onClick={() => onSelectFile(f.id)} title={f.fileName}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M3 1h6l4 4v9a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
                <span className="file-tab-label">{f.fileName}</span>
              </button>
              {allFiles.length > 1 && (
                <button
                  className="file-tab-remove"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(f.id); }}
                  title="Hapus file ini"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="btn btn-outline btn-sm" onClick={onImportMore}>
          + Import File Lain
        </button>
      </div>

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Hapus File</h3>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Yakin ingin menghapus file <b>{allFiles.find((f) => f.id === confirmDelete)?.fileName}</b>?</p>
              <p className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>Tindakan ini tidak dapat dibatalkan.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button className="btn btn-danger" onClick={() => { onRemoveFile(confirmDelete); setConfirmDelete(null); }}>Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* FILE HEADER */}
      <div className="result-header">
        <div className="result-header-info">
          <h2>{fileName}</h2>
          <p>{sheetNames.length} sheet &middot; {rows.length.toLocaleString("id-ID")} baris &middot; {headers.length} kolom</p>
        </div>
      </div>

      {/* SHEET TABS */}
      {sheetNames.length > 1 && (
        <div className="card excel-sheets-card">
          <div className="card-header">
            <h2>Sheet</h2>
            <span className="badge pending">{sheetNames.length} sheet</span>
          </div>
          <div className="card-body" style={{ padding: "0 18px 14px" }}>
            <div className="sheet-tabs">
              {sheetNames.map((name) => (
                <button key={name} className={`sheet-tab${activeSheet === name ? " active" : ""}`} onClick={() => setActiveSheet(name)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STATS */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">&#128202;</div>
          <div className="stat-info"><span className="label">Total Baris</span><span className="value">{rows.length.toLocaleString("id-ID")}</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">&#128203;</div>
          <div className="stat-info"><span className="label">Total Kolom</span><span className="value">{headers.length}</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">&#128176;</div>
          <div className="stat-info"><span className="label">Kolom Numerik</span><span className="value">{numericCols.length}</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber">&#128196;</div>
          <div className="stat-info"><span className="label">Kolom Kategorikal</span><span className="value">{categoricalCols.length}</span></div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="card excel-table-card">
        <div className="card-header">
          <h2>Data &mdash; {activeSheet}</h2>
          <span className="badge masuk">{rows.length} baris &times; {headers.length} kolom</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {headers.length === 0 ? (
            <div className="empty-state"><div className="big">&#128196;</div><p>Sheet ini kosong</p></div>
          ) : (
            <div className="table-wrap excel-table-wrap">
              <table className="table excel-data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36, textAlign: "center" }}>#</th>
                    {headers.map((h, i) => (
                      <th key={i} style={{ width: colWidths[i] || 80, minWidth: colWidths[i] || 80, ...(headerColors[i] ? { backgroundColor: headerColors[i] } : undefined) }}>
                        <span className="excel-th-text">{h}</span>
                        <span className={`excel-th-badge ${colTypes[h] || "text"}`}>
                          {colTypes[h] === "number" ? "123" : colTypes[h] === "date" ? "Tgl" : "Abc"}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      <td style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 12, width: 36 }}>{ri + 1}</td>
                      {headers.map((h, ci) => {
                        const info = mergeSpan(ri, ci);
                        if (info && !info.isAnchor) return null;
                        const m = info ? info.m : null;
                        const colSpanN = m ? m.c2 - m.c1 + 1 : 1;
                        const rowSpanN = m ? m.r2 - m.r1 + 1 : 1;
                        const isNum = colTypes[h] === "number";
                        const bg = rowColors[ri] && rowColors[ri][ci] ? { backgroundColor: rowColors[ri][ci] } : undefined;
                        const rh = rowHeights[ri] || undefined;
                        return (
                          <td key={ci} className={isNum ? "text-right" : ""}
                            colSpan={colSpanN > 1 ? colSpanN : undefined}
                            rowSpan={rowSpanN > 1 ? rowSpanN : undefined}
                            style={{ width: spanWidth(ci, colSpanN), minWidth: spanWidth(ci, colSpanN), minHeight: rh, height: rh, whiteSpace: "pre-wrap", ...bg }}>
                            {cellText(ri, ci)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* CHART */}
      <div className="excel-chart-section">
        <div className="card excel-chart-config-card">
          <div className="card-header"><h2>Konfigurasi Chart</h2></div>
          <div className="card-body">
            <div className="form-group">
              <label>Jenis Chart</label>
              <div className="chart-type-grid">
                {CHART_TYPES.map((ct) => (
                  <button key={ct.value} className={`chart-type-btn${chartType === ct.value ? " active" : ""}`}
                    onClick={() => { setChartType(ct.value); setChartKey((k) => k + 1); }}>
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Sumbu X (Label / Kategori)</label>
              <select className="form-control" value={chartX}
                onChange={(e) => { setChartX(e.target.value); setChartKey((k) => k + 1); }}>
                <option value="">-- Pilih Kolom --</option>
                {headers.map((c) => (
                  <option key={c} value={c}>{c} {colTypes[c] === "number" ? "(Numerik)" : colTypes[c] === "date" ? "(Tanggal)" : "(Teks)"}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Sumbu Y (Data Numerik)</label>
              <div className="chart-y-checkboxes">
                {headers.length === 0 && <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Tidak ada kolom</span>}
                {headers.map((c) => {
                  const t = colTypes[c];
                  return (
                    <label key={c} className={`chart-y-check${chartY.includes(c) ? " selected" : ""}`}>
                      <input type="checkbox" checked={chartY.includes(c)} onChange={() => toggleChartY(c)} />
                      <span className="chart-y-check-label">{c}</span>
                      <span className={`chart-y-check-type ${t}`}>{t === "number" ? "Num" : t === "date" ? "Date" : "Text"}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="card excel-chart-render-card">
          <div className="card-header">
            <h2>Visualisasi Chart</h2>
            {chartData && <span className="badge masuk" style={{ fontSize: 11 }}>{chartData.labels.length} label &middot; {chartData.datasets.length} series</span>}
          </div>
          <div className="card-body">
            {chartData ? (
              <div className="excel-chart-canvas">{renderChart()}</div>
            ) : (
              <div className="empty-state" style={{ padding: "40px 16px" }}>
                <div className="big">&#128202;</div>
                <p>{numericCols.length === 0 ? "Tidak ditemukan kolom numerik. Pilih kolom Sumbu X dan centang kolom untuk Sumbu Y." : "Pilih kolom Sumbu X dan centang minimal satu kolom untuk Sumbu Y."}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PERBANDINGAN DATA */}
      <div className="card mt">
        <PerbandinganData
          tables={[{ name: activeSheet, headers, rows }]}
          title={`Perbandingan Data &mdash; ${activeSheet}`}
        />
      </div>
    </div>
  );
}
