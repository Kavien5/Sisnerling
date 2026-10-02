import React from "react";
import { getSheets, getNonEmptyRows, sheetNumericTotal, sheetCellCount } from "../spreadsheetWorkbook.js";
import { formatNumber } from "../api.js";
import Modal from "../components/Modal.jsx";
import PerbandinganData from "../components/PerbandinganData.jsx";
import { sheetsToTables } from "../perbandinganUtils.js";

export default function Laporan() {
  const [sheets, setSheets] = React.useState(() => getSheets());
  const [tables, setTables] = React.useState(() => sheetsToTables(getSheets()));
  const [showCompare, setShowCompare] = React.useState(false);

  React.useEffect(() => {
    const refresh = () => {
      setSheets(getSheets());
      setTables(sheetsToTables(getSheets()));
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const rows = sheets.map((s) => {
    const baris = getNonEmptyRows(s);
    const jumlahBaris = baris.length;
    const namaKategori = s.name;
    return {
      nama: s.name,
      kategori: namaKategori,
      jumlahBaris,
      jumlahSel: sheetCellCount(s),
      totalNilai: sheetNumericTotal(s),
      kolom: s.columns ? s.columns.length : 0,
    };
  });

  const sumBaris = rows.reduce((a, r) => a + r.jumlahBaris, 0);
  const sumSel = rows.reduce((a, r) => a + r.jumlahSel, 0);
  const sumNilai = rows.reduce((a, r) => a + r.totalNilai, 0);

  return (
    <>
      <div className="page-title" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2>Laporan</h2>
          <p>Rekapitulasi data per sheet dari halaman Spreadsheet</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCompare(true)}
          style={{ whiteSpace: "nowrap" }}
        >
          &#8693; Perbandingan Antar Periode
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Sheet / Kategori</th>
                <th>Kolom</th>
                <th>Baris Berisi</th>
                <th>Sel Terisi</th>
                <th>Total Nilai</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-bold">{r.nama}</td>
                  <td>{formatNumber(r.kolom)}</td>
                  <td>{formatNumber(r.jumlahBaris)}</td>
                  <td>{formatNumber(r.jumlahSel)}</td>
                  <td className="font-bold">{formatNumber(r.totalNilai)}</td>
                </tr>
              ))}
              <tr className="row-active" style={{ fontWeight: 700 }}>
                <td>TOTAL</td>
                <td />
                <td>{formatNumber(sumBaris)}</td>
                <td>{formatNumber(sumSel)}</td>
                <td>{formatNumber(sumNilai)}</td>
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

      <div className="card mt">
        <PerbandinganData tables={tables} title="Perbandingan Data" />
      </div>

      {showCompare && (
        <Modal
          title="Perbandingan Data"
          onClose={() => setShowCompare(false)}
          width={980}
          footer={
            <button className="btn btn-primary" onClick={() => setShowCompare(false)}>Tutup</button>
          }
        >
          <div className="cmp-modal-body">
            <PerbandinganData tables={tables} title="Perbandingan Antar Periode" compact />
          </div>
        </Modal>
      )}
    </>
  );
}
