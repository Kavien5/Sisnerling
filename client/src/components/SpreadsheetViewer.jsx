import React from "react";
import { getSheets, getNonEmptyRows, sheetNumericTotal, sheetCellCount } from "../spreadsheetWorkbook.js";
import { formatNumber } from "../api.js";

export default function SpreadsheetViewer() {
  const [sheets, setSheets] = React.useState(() => getSheets());
  const [activeIdx, setActiveIdx] = React.useState(0);

  React.useEffect(() => {
    const listener = () => setSheets(getSheets());
    window.addEventListener("storage", listener);
    window.addEventListener("focus", listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("focus", listener);
    };
  }, []);

  const refresh = () => setSheets(getSheets());

  if (!sheets || sheets.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="big">&#128202;</div>
          <p>Belum ada data spreadsheet. Buka halaman <b>Spreadsheet</b> lalu isi/import data terlebih dahulu.</p>
          <button className="btn btn-outline btn-sm" onClick={refresh}>Muat Ulang</button>
        </div>
      </div>
    );
  }

  const activeIdxSafe = Math.min(activeIdx, sheets.length - 1);
  const active = sheets[activeIdxSafe];
  const cols = active.columns || [];
  const nonEmptyRows = getNonEmptyRows(active);

  return (
    <div className="sv-wrap">
      <div className="card">
        <div className="card-header">
          <h2>Ringkasan Spreadsheet</h2>
          <button className="btn btn-outline btn-sm" onClick={refresh}>Muat Ulang</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Sheet</th>
                <th>Baris Berisi</th>
                <th>Kolom</th>
                <th>Sel Terisi</th>
                <th>Total Nilai Numerik</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((s, i) => (
                <tr
                  key={i}
                  className={i === activeIdxSafe ? "row-selected" : ""}
                  style={{ cursor: "pointer" }}
                  onClick={() => setActiveIdx(i)}
                >
                  <td className="font-bold">{s.name}</td>
                  <td>{formatNumber(getNonEmptyRows(s).length)}</td>
                  <td>{s.columns ? s.columns.length : 0}</td>
                  <td>{formatNumber(sheetCellCount(s))}</td>
                  <td className="font-bold">{formatNumber(sheetNumericTotal(s))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt">
        <div className="card-header">
          <h2>Isi Sheet: {active.name}</h2>
          <span className="ee-info-badge">
            {nonEmptyRows.length} baris &times; {cols.length || 0} kolom
          </span>
        </div>
        <div className="sv-sheet-tabs">
          {sheets.map((s, i) => (
            <button
              key={i}
              className={`sv-tab${i === activeIdxSafe ? " active" : ""}`}
              onClick={() => setActiveIdx(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="table sv-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key}>{c.key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nonEmptyRows.map((row, ri) => (
                <tr key={ri}>
                  {cols.map((c) => {
                    const v = row[c.key];
                    return <td key={c.key}>{v === "" || v === null || v === undefined ? "" : String(v)}</td>;
                  })}
                </tr>
              ))}
              {nonEmptyRows.length === 0 && (
                <tr>
                  <td colSpan={cols.length || 1} className="empty-state">Sheet kosong</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
