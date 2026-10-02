import React from "react";
import { getSheets, getNonEmptyRows, sheetNumericTotal, sheetCellCount } from "../spreadsheetWorkbook.js";
import { formatNumber } from "../api.js";

export default function KategoriPage() {
  const [sheets, setSheets] = React.useState(() => getSheets());

  React.useEffect(() => {
    const refresh = () => setSheets(getSheets());
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const rows = sheets.map((s) => ({
    id: s.id || s.name,
    nama: s.name,
    jumlahBaris: getNonEmptyRows(s).length,
    jumlahSel: sheetCellCount(s),
    totalNilai: sheetNumericTotal(s),
  }));

  const grandBaris = rows.reduce((a, r) => a + r.jumlahBaris, 0);
  const grandSel = rows.reduce((a, r) => a + r.jumlahSel, 0);

  return (
    <>
      <div className="page-title">
        <h2>Kategori</h2>
        <p>Daftar kategori dari sheet di halaman Spreadsheet</p>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>No</th>
                <th>Nama Kategori (Sheet)</th>
                <th>Baris Berisi</th>
                <th>Sel Terisi</th>
                <th>Total Nilai</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k, i) => (
                <tr key={i}>
                  <td className="text-muted">{i + 1}</td>
                  <td className="font-bold">{k.nama}</td>
                  <td>{formatNumber(k.jumlahBaris)}</td>
                  <td>{formatNumber(k.jumlahSel)}</td>
                  <td className="font-bold">{formatNumber(k.totalNilai)}</td>
                </tr>
              ))}
              <tr className="row-active" style={{ fontWeight: 700 }}>
                <td />
                <td>TOTAL</td>
                <td>{formatNumber(grandBaris)}</td>
                <td>{formatNumber(grandSel)}</td>
                <td>{formatNumber(rows.reduce((a, r) => a + r.totalNilai, 0))}</td>
              </tr>
              {rows.length === 0 && (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state">Belum ada data. Isi/import data di halaman Spreadsheet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
