import React from "react";
import { formatRupiah, formatNumber } from "../api.js";

export default function YearlyGrid({ data, loading }) {
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const rightRef = React.useRef(null);
  const leftRef = React.useRef(null);

  const years = data?.years || [];
  const rows = data?.bySubKategori || [];
  const totals = data?.totals || [];

  const kategoriNames = [...new Set(rows.map((r) => r.nama_kategori).filter(Boolean))];

  const syncScroll = (source) => (e) => {
    const y = e.target.scrollTop;
    if (source === "left" && rightRef.current) {
      rightRef.current.scrollTop = y;
    } else if (source === "right" && leftRef.current) {
      leftRef.current.scrollTop = y;
    }
    if (source === "right") {
      setScrollLeft(e.target.scrollLeft);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div>
          <div className="spinner" />
          <span>Memuat data tahunan...</span>
        </div>
      </div>
    );
  }

  if (!data || years.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">📅</div>
        Belum ada data tahunan. Tambahkan data dengan tanggal terlebih dahulu.
      </div>
    );
  }

  const maxVal = Math.max(1, ...totals.map((t) => Number(t.total_nilai) || 0));
  const maxJumlah = Math.max(1, ...totals.map((t) => Number(t.total_jumlah) || 0));
  const maxItem = Math.max(1, ...totals.map((t) => Number(t.jumlah_item) || 0));

  return (
    <div className="yearly-grid-wrapper">
      <div className="yearly-grid">
        <div className="yearly-left" ref={leftRef} onScroll={syncScroll("left")}>
          <table className="yearly-table yearly-table-left">
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="yl-th yl-th-corner">#</th>
                <th className="yl-th">Kategori</th>
                <th className="yl-th">Sub Kategori</th>
                <th className="yl-th">Jumlah</th>
                <th className="yl-th">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "yl-even" : ""}>
                  <td className="yl-td yl-td-num">{i + 1}</td>
                  <td className="yl-td yl-td-kat">{row.nama_kategori || "-"}</td>
                  <td className="yl-td yl-td-sub">{row.sub_kategori || "-"}</td>
                  <td className="yl-td yl-td-num text-right">{formatNumber(row.total_jumlah)}</td>
                  <td className="yl-td yl-td-num text-right font-bold">{formatRupiah(row.total_nilai)}</td>
                </tr>
              ))}
              <tr className="yl-total-row">
                <td colSpan={4} className="yl-td yl-td-sub" style={{ fontWeight: 700 }}>TOTAL</td>
                <td className="yl-td yl-td-num text-right font-bold">
                  {formatRupiah(totals.reduce((a, t) => a + Number(t.total_nilai || 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="yearly-divider" />

        <div className="yearly-right" ref={rightRef} onScroll={syncScroll("right")}>
          <table className="yearly-table yearly-table-right" style={{ marginLeft: -scrollLeft }}>
            <colgroup>
              {years.map((y) => (
                <col key={y} style={{ width: `${100 / (years.length + 1)}%` }} />
              ))}
              <col style={{ width: `${100 / (years.length + 1)}%` }} />
            </colgroup>
            <thead>
              <tr>
                {years.map((y) => (
                  <th key={y} className="yr-th">
                    <div className="yr-th-year">{y}</div>
                    <div className="yr-th-sub">Nilai</div>
                  </th>
                ))}
                <th className="yr-th yr-th-total">
                  <div className="yr-th-year">Total</div>
                  <div className="yr-th-sub">Semua</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                let grandTotal = 0;
                let grandJumlah = 0;
                let grandItem = 0;
                return (
                  <tr key={i} className={i % 2 === 0 ? "yl-even" : ""}>
                    {years.map((y) => {
                      const match = data.bySubKategori.find(
                        (r) => r.tahun === y && r.sub_kategori === row.sub_kategori && r.nama_kategori === row.nama_kategori
                      );
                      const val = Number(match?.total_nilai) || 0;
                      const jumlah = Number(match?.total_jumlah) || 0;
                      const item = Number(match?.jumlah_item) || 0;
                      grandTotal += val;
                      grandJumlah += jumlah;
                      grandItem += item;
                      const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                      return (
                        <td key={y} className="yr-td">
                          {val > 0 ? (
                            <div className="yr-cell">
                              <div className="yr-val">{formatRupiah(val)}</div>
                              <div className="yr-sub">{formatNumber(jumlah)} unit · {item} item</div>
                              <div className="yr-bar-track">
                                <div className="yr-bar-fill" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          ) : (
                            <span className="yr-empty">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="yr-td yr-td-total">
                      <div className="yr-cell">
                        <div className="yr-val font-bold">{formatRupiah(grandTotal)}</div>
                        <div className="yr-sub">{formatNumber(grandJumlah)} unit · {grandItem} item</div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="yl-total-row">
                {years.map((y) => {
                  const match = totals.find((t) => t.tahun === y);
                  const val = Number(match?.total_nilai) || 0;
                  const jumlah = Number(match?.total_jumlah) || 0;
                  const item = Number(match?.jumlah_item) || 0;
                  const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                  return (
                    <td key={y} className="yr-td yr-td-total">
                      {val > 0 ? (
                        <div className="yr-cell">
                          <div className="yr-val font-bold">{formatRupiah(val)}</div>
                          <div className="yr-sub">{formatNumber(jumlah)} unit · {item} item</div>
                          <div className="yr-bar-track">
                            <div className="yr-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="yr-empty">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="yr-td yr-td-total">
                  <div className="yr-cell">
                    <div className="yr-val font-bold">
                      {formatRupiah(totals.reduce((a, t) => a + Number(t.total_nilai || 0), 0))}
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="yearly-charts">
        <div className="card">
          <div className="card-header">
            <h2>Grafik Nilai per Tahun</h2>
          </div>
          <div className="card-body">
            <div className="chart-bars">
              {years.map((y) => {
                const match = totals.find((t) => t.tahun === y);
                const val = Number(match?.total_nilai) || 0;
                const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                return (
                  <div className="chart-row" key={y}>
                    <span style={{ minWidth: 50, fontWeight: 600 }}>{y}</span>
                    <span className="chart-track">
                      <span className="chart-fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span style={{ minWidth: 120, textAlign: "right" }}>{val > 0 ? formatRupiah(val) : "-"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {kategoriNames.length > 0 && (
          <div className="card mt">
            <div className="card-header">
              <h2>Perbandingan Kategori per Tahun</h2>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kategori</th>
                    {years.map((y) => (
                      <th key={y} className="text-right">{y}</th>
                    ))}
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {kategoriNames.map((kn) => {
                    let grandTotal = 0;
                    return (
                      <tr key={kn}>
                        <td className="font-bold">{kn}</td>
                        {years.map((y) => {
                          const match = data.byKategori.find((r) => r.tahun === y && r.nama_kategori === kn);
                          const val = Number(match?.total_nilai) || 0;
                          grandTotal += val;
                          return (
                            <td key={y} className="text-right">{val > 0 ? formatRupiah(val) : "-"}</td>
                          );
                        })}
                        <td className="text-right font-bold">{grandTotal > 0 ? formatRupiah(grandTotal) : "-"}</td>
                      </tr>
                    );
                  })}
                  <tr className="row-active" style={{ fontWeight: 700 }}>
                    <td>TOTAL</td>
                    {years.map((y) => {
                      const match = totals.find((t) => t.tahun === y);
                      return (
                        <td key={y} className="text-right">
                          {Number(match?.total_nilai) > 0 ? formatRupiah(match.total_nilai) : "-"}
                        </td>
                      );
                    })}
                    <td className="text-right">
                      {formatRupiah(totals.reduce((a, t) => a + Number(t.total_nilai || 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
