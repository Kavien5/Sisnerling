import React from "react";
import { api, formatNumber, formatRupiah, formatTanggal } from "../api.js";

const COLORS = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626", "#ec4899"];
const statusColors = { Masuk: "masuk", Keluar: "keluar", Pending: "pending" };
const statusTextColors = { Masuk: "#059669", Keluar: "#dc2626", Pending: "#d97706" };

export default function NeracaOverview({ kategoriId, status, onNavigate }) {
  const [subKategori, setSubKategori] = React.useState([]);
  const [allData, setAllData] = React.useState([]);
  const [kategori, setKategori] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [sortKey, setSortKey] = React.useState("sub_kategori");
  const [sortDir, setSortDir] = React.useState("asc");
  const [trendMode, setTrendMode] = React.useState("monthly");

  const allYears = React.useMemo(() => {
    const yrs = new Set();
    allData.forEach((d) => { if (d.tanggal) yrs.add(String(new Date(d.tanggal).getFullYear())); });
    const currentYear = String(new Date().getFullYear());
    yrs.add(currentYear);
    for (let y = 2020; y <= 2035; y++) yrs.add(String(y));
    return [...yrs].sort();
  }, [allData]);

  const [trendYearStart, setTrendYearStart] = React.useState(() => {
    const yrs = allData.map((d) => d.tanggal ? new Date(d.tanggal).getFullYear() : null).filter(Boolean);
    return yrs.length ? String(Math.min(...yrs)) : String(new Date().getFullYear());
  });
  const [trendYearEnd, setTrendYearEnd] = React.useState(() => {
    const yrs = allData.map((d) => d.tanggal ? new Date(d.tanggal).getFullYear() : null).filter(Boolean);
    return yrs.length ? String(Math.max(...yrs)) : String(new Date().getFullYear());
  });
  const [trendMonthStart, setTrendMonthStart] = React.useState("01");
  const [trendMonthEnd, setTrendMonthEnd] = React.useState("12");

  React.useEffect(() => {
    if (allData.length === 0) return;
    const yrs = allData.map((d) => d.tanggal ? new Date(d.tanggal).getFullYear() : null).filter(Boolean);
    if (yrs.length) {
      setTrendYearStart(String(Math.min(...yrs)));
      setTrendYearEnd(String(Math.max(...yrs)));
    }
  }, [allData]);

  React.useEffect(() => {
    if (!kategoriId) return;
    setLoading(true);
    Promise.all([
      api.getSubKategori(kategoriId),
      api.getKategori(),
      api.getData({ kategoriId, perPage: 100000, status: status === "Masuk" ? ["Masuk", "Pending"] : status || undefined }),
    ])
      .then(([subs, kats, dataRes]) => {
        setSubKategori(subs);
        setKategori(kats.find((k) => String(k.id) === String(kategoriId)));
        setAllData(dataRes.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kategoriId, status]);

  if (loading) {
    return (
      <div className="loading">
        <div>
          <div className="spinner" />
          <span>Memuat neraca...</span>
        </div>
      </div>
    );
  }

  const family = status === "Masuk" ? "input" : status === "Keluar" ? "output" : "input";
  const familyLabel = status === "Masuk" ? "Input" : status === "Keluar" ? "Output" : "Input";

  const totalItems = allData.length;
  const totalJumlah = allData.reduce((s, d) => s + Number(d.jumlah || 0), 0);
  const totalNilai = allData.reduce((s, d) => s + Number(d.jumlah || 0) * Number(d.harga || 0), 0);

  const skMap = {};
  subKategori.forEach((sk) => { skMap[sk.id] = sk.nama; });

  const bySubKategori = subKategori.map((sk) => {
    const items = allData.filter((d) => d.sub_kategori_id === sk.id);
    const jumlah = items.reduce((s, d) => s + Number(d.jumlah || 0), 0);
    const nilai = items.reduce((s, d) => s + Number(d.jumlah || 0) * Number(d.harga || 0), 0);
    const byStatus = ["Masuk", "Keluar", "Pending"].map((st) => ({
      status: st,
      count: items.filter((d) => d.status === st).length,
    }));
    return { ...sk, items, itemCount: items.length, jumlah, nilai, byStatus };
  });

  const maxNilai = Math.max(1, ...bySubKategori.map((s) => s.nilai));
  const maxJumlahAll = Math.max(1, ...allData.map((d) => Number(d.jumlah || 0)));
  const unassignedData = allData.filter((d) => !d.sub_kategori_id);

  // Tren Perkembangan per Bulan per Sub-Kategori
  const byMonth = {};
  allData.forEach((d) => {
    if (!d.tanggal) return;
    const dt = new Date(d.tanggal);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const label = dt.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
    if (!byMonth[key]) byMonth[key] = { key, label, subKategori: {} };
    const skId = d.sub_kategori_id || "unassigned";
    if (!byMonth[key].subKategori[skId]) byMonth[key].subKategori[skId] = { jumlah: 0, nilai: 0, count: 0 };
    byMonth[key].subKategori[skId].jumlah += Number(d.jumlah || 0);
    byMonth[key].subKategori[skId].nilai += Number(d.jumlah || 0) * Number(d.harga || 0);
    byMonth[key].subKategori[skId].count++;
  });
  const monthlyData = Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key));
  const maxMonthlyNilai = Math.max(1, ...monthlyData.map((m) => {
    return Object.values(m.subKategori).reduce((s, v) => s + v.nilai, 0);
  }));
  const skIds = subKategori.map((sk) => String(sk.id));
  const skNames = {};
  subKategori.forEach((sk) => { skNames[String(sk.id)] = sk.nama; });
  skNames["unassigned"] = "Tanpa Sub-Kategori";

  const sortedData = [...allData].sort((a, b) => {
    let va, vb;
    if (sortKey === "sub_kategori") {
      va = skMap[a.sub_kategori_id] || "ZZZ";
      vb = skMap[b.sub_kategori_id] || "ZZZ";
    } else if (sortKey === "kode") {
      va = a.kode || "";
      vb = b.kode || "";
    } else if (sortKey === "nama") {
      va = a.nama || "";
      vb = b.nama || "";
    } else if (sortKey === "jumlah") {
      va = Number(a.jumlah || 0);
      vb = Number(b.jumlah || 0);
    } else if (sortKey === "harga") {
      va = Number(a.harga || 0);
      vb = Number(b.harga || 0);
    } else if (sortKey === "total") {
      va = Number(a.jumlah || 0) * Number(a.harga || 0);
      vb = Number(b.jumlah || 0) * Number(b.harga || 0);
    } else if (sortKey === "status") {
      va = a.status || "";
      vb = b.status || "";
    } else if (sortKey === "tanggal") {
      va = a.tanggal || "";
      vb = b.tanggal || "";
    } else {
      va = a.kode || "";
      vb = b.kode || "";
    }
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === "asc" ? va - vb : vb - va;
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span style={{ opacity: 0.2, marginLeft: 2 }}>&#9650;&#9660;</span>;
    return <span style={{ marginLeft: 2 }}>{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>;
  };

  return (
    <>
      <div className="page-title">
        <p>
          <span className="text-muted">{familyLabel}</span> &middot; <b>{kategori?.nama_kategori || "Neraca"}</b>
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-info">
            <div className="label">Total Item</div>
            <div className="value">{formatNumber(totalItems)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <div className="label">Total Jumlah</div>
            <div className="value">{formatNumber(totalJumlah)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <div className="label">Total Nilai</div>
            <div className="value" style={{ fontSize: 16 }}>{formatRupiah(totalNilai)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-info">
            <div className="label">Sub-Kategori</div>
            <div className="value">{subKategori.length}</div>
          </div>
        </div>
      </div>

      {/* Ringkasan per Sub-Kategori */}
      <div className="card mt">
        <div className="card-header">
          <h2>Ringkasan per Sub-Kategori</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>Sub-Kategori</th>
                <th className="text-right">Jumlah Item</th>
                <th className="text-right">Total Jumlah</th>
                <th className="text-right">Total Nilai</th>
                <th style={{ width: 200 }}>Komposisi</th>
              </tr>
            </thead>
            <tbody>
              {bySubKategori.map((sk, i) => (
                <tr key={sk.id} style={{ cursor: "pointer" }} onClick={() => onNavigate(`${family}:${kategoriId}:${sk.id}`)}>
                  <td><span className="chart-dot" style={{ background: COLORS[i % COLORS.length] }} /></td>
                  <td className="font-bold">{sk.nama}</td>
                  <td className="text-right">{formatNumber(sk.itemCount)}</td>
                  <td className="text-right">{formatNumber(sk.jumlah)}</td>
                  <td className="text-right font-bold">{formatRupiah(sk.nilai)}</td>
                  <td>
                    <div className="chart-track" style={{ height: 8 }}>
                      <div
                        className="chart-fill"
                        style={{ width: `${maxNilai ? (sk.nilai / maxNilai) * 100 : 0}%`, background: COLORS[i % COLORS.length] }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {unassignedData.length > 0 && (
                <tr style={{ opacity: 0.6 }}>
                  <td><span className="chart-dot" style={{ background: "#94a3b8" }} /></td>
                  <td className="font-bold">Tanpa Sub-Kategori</td>
                  <td className="text-right">{formatNumber(unassignedData.length)}</td>
                  <td className="text-right">{formatNumber(unassignedData.reduce((s, d) => s + Number(d.jumlah || 0), 0))}</td>
                  <td className="text-right font-bold">{formatRupiah(unassignedData.reduce((s, d) => s + Number(d.jumlah || 0) * Number(d.harga || 0), 0))}</td>
                  <td />
                </tr>
              )}
              <tr className="row-active" style={{ fontWeight: 700 }}>
                <td />
                <td>TOTAL</td>
                <td className="text-right">{formatNumber(totalItems)}</td>
                <td className="text-right">{formatNumber(totalJumlah)}</td>
                <td className="text-right">{formatRupiah(totalNilai)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Grafik Perbandingan */}
      <div className="card mt">
        <div className="card-header">
          <h2>Perbandingan Sub-Kategori</h2>
        </div>
        <div className="card-body">
          {bySubKategori.length === 0 ? (
            <div className="empty-state">Belum ada sub-kategori</div>
          ) : (
            <div className="chart-bars">
              {bySubKategori.map((sk, i) => (
                <div className="chart-row" key={sk.id}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 130, fontSize: 13 }}>
                    <span className="chart-dot" style={{ background: COLORS[i % COLORS.length] }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sk.nama}</span>
                  </span>
                  <span className="chart-track">
                    <span
                      className="chart-fill"
                      style={{ width: `${maxNilai ? (sk.nilai / maxNilai) * 100 : 0}%`, background: COLORS[i % COLORS.length] }}
                    />
                  </span>
                  <b style={{ minWidth: 120, textAlign: "right", fontSize: 13 }}>{formatRupiah(sk.nilai)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Perkembangan — Bulanan / Tahunan dengan Filter Range */}
      {monthlyData.length > 0 && (() => {
        const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
        const MONTH_LABELS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

        const filteredData = allData.filter((d) => {
          if (!d.tanggal) return false;
          const dt = new Date(d.tanggal);
          const yr = String(dt.getFullYear());
          const mo = String(dt.getMonth() + 1).padStart(2, "0");
          if (yr < trendYearStart || yr > trendYearEnd) return false;
          if (yr === trendYearStart && mo < trendMonthStart) return false;
          if (yr === trendYearEnd && mo > trendMonthEnd) return false;
          return true;
        });

        const byMonthFiltered = {};
        filteredData.forEach((d) => {
          const dt = new Date(d.tanggal);
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
          const label = dt.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
          if (!byMonthFiltered[key]) byMonthFiltered[key] = { key, label, subKategori: {} };
          const skId = d.sub_kategori_id || "unassigned";
          if (!byMonthFiltered[key].subKategori[skId]) byMonthFiltered[key].subKategori[skId] = { jumlah: 0, nilai: 0, count: 0 };
          byMonthFiltered[key].subKategori[skId].jumlah += Number(d.jumlah || 0);
          byMonthFiltered[key].subKategori[skId].nilai += Number(d.jumlah || 0) * Number(d.harga || 0);
          byMonthFiltered[key].subKategori[skId].count++;
        });
        const monthlyFiltered = Object.values(byMonthFiltered).sort((a, b) => a.key.localeCompare(b.key));

        const byYearFiltered = {};
        filteredData.forEach((d) => {
          const yr = String(new Date(d.tanggal).getFullYear());
          if (!byYearFiltered[yr]) byYearFiltered[yr] = { key: yr, label: yr, subKategori: {} };
          const skId = d.sub_kategori_id || "unassigned";
          if (!byYearFiltered[yr].subKategori[skId]) byYearFiltered[yr].subKategori[skId] = { jumlah: 0, nilai: 0, count: 0 };
          byYearFiltered[yr].subKategori[skId].jumlah += Number(d.jumlah || 0);
          byYearFiltered[yr].subKategori[skId].nilai += Number(d.jumlah || 0) * Number(d.harga || 0);
          byYearFiltered[yr].subKategori[skId].count++;
        });
        const yearlyFiltered = Object.values(byYearFiltered).sort((a, b) => a.key.localeCompare(b.key));

        const trendData = trendMode === "monthly" ? monthlyFiltered : yearlyFiltered;
        const maxTrendNilai = Math.max(1, ...trendData.map((m) => Object.values(m.subKategori).reduce((s, v) => s + v.nilai, 0)));
        const maxTrendJumlah = Math.max(1, ...trendData.map((m) => Object.values(m.subKategori).reduce((s, v) => s + v.jumlah, 0)));

        return (
          <div className="card mt">
            <div className="card-header">
              <h2>Perkembangan</h2>
              <div style={{ display: "flex", gap: 4, marginLeft: "auto", alignItems: "center", flexWrap: "wrap" }}>
                <select className="form-control form-control-sm" style={{ width: "auto", fontSize: 12, padding: "4px 8px" }} value={trendYearStart} onChange={(e) => setTrendYearStart(e.target.value)}>
                  {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="form-control form-control-sm" style={{ width: "auto", fontSize: 12, padding: "4px 8px" }} value={trendMonthStart} onChange={(e) => setTrendMonthStart(e.target.value)}>
                  {MONTHS.map((m, i) => <option key={m} value={m}>{MONTH_LABELS[i]}</option>)}
                </select>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>&mdash;</span>
                <select className="form-control form-control-sm" style={{ width: "auto", fontSize: 12, padding: "4px 8px" }} value={trendYearEnd} onChange={(e) => setTrendYearEnd(e.target.value)}>
                  {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="form-control form-control-sm" style={{ width: "auto", fontSize: 12, padding: "4px 8px" }} value={trendMonthEnd} onChange={(e) => setTrendMonthEnd(e.target.value)}>
                  {MONTHS.map((m, i) => <option key={m} value={m}>{MONTH_LABELS[i]}</option>)}
                </select>
                <button className="btn btn-sm btn-outline" onClick={() => {
                  const cy = String(new Date().getFullYear());
                  setTrendYearStart(cy); setTrendYearEnd(cy);
                  setTrendMonthStart("01"); setTrendMonthEnd("12");
                }}>Tahun Ini</button>
                <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
                <button className={`btn btn-sm ${trendMode === "monthly" ? "btn-primary" : "btn-outline"}`} onClick={() => setTrendMode("monthly")}>Bulanan</button>
                <button className={`btn btn-sm ${trendMode === "yearly" ? "btn-primary" : "btn-outline"}`} onClick={() => setTrendMode("yearly")}>Tahunan</button>
              </div>
            </div>
            <div className="card-body">
              {trendData.length === 0 ? (
                <div className="empty-state">Tidak ada data di rentang waktu ini</div>
              ) : (
                <>
                  <h3 style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 8 }}>Nilai (Rp)</h3>
                  <div className="chart-bars">
                    {trendData.map((m) => {
                      const total = Object.values(m.subKategori).reduce((s, v) => s + v.nilai, 0);
                      return (
                        <div className="chart-row" key={m.key}>
                          <span style={{ minWidth: trendMode === "monthly" ? 80 : 50, fontSize: 12, fontWeight: 600 }}>{m.label}</span>
                          <span className="chart-track" style={{ display: "flex", overflow: "hidden" }}>
                            {skIds.map((skId, i) => {
                              const val = m.subKategori[skId]?.nilai || 0;
                              const pct = maxTrendNilai ? (val / maxTrendNilai) * 100 : 0;
                              return pct > 0 ? (
                                <span key={skId} title={`${skNames[skId]}: ${formatRupiah(val)}`} style={{ width: `${pct}%`, background: COLORS[i % COLORS.length], height: "100%", minWidth: pct > 0 ? 2 : 0 }} />
                              ) : null;
                            })}
                          </span>
                          <b style={{ minWidth: 110, textAlign: "right", fontSize: 13 }}>{formatRupiah(total)}</b>
                        </div>
                      );
                    })}
                  </div>

                  <h3 style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 20, marginBottom: 8 }}>Jumlah (unit)</h3>
                  <div className="chart-bars">
                    {trendData.map((m) => {
                      const total = Object.values(m.subKategori).reduce((s, v) => s + v.jumlah, 0);
                      return (
                        <div className="chart-row" key={m.key}>
                          <span style={{ minWidth: trendMode === "monthly" ? 80 : 50, fontSize: 12, fontWeight: 600 }}>{m.label}</span>
                          <span className="chart-track" style={{ display: "flex", overflow: "hidden" }}>
                            {skIds.map((skId, i) => {
                              const val = m.subKategori[skId]?.jumlah || 0;
                              const pct = maxTrendJumlah ? (val / maxTrendJumlah) * 100 : 0;
                              return pct > 0 ? (
                                <span key={skId} title={`${skNames[skId]}: ${formatNumber(val)}`} style={{ width: `${pct}%`, background: COLORS[i % COLORS.length], height: "100%", minWidth: pct > 0 ? 2 : 0 }} />
                              ) : null;
                            })}
                          </span>
                          <b style={{ minWidth: 70, textAlign: "right", fontSize: 13 }}>{formatNumber(total)}</b>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {skIds.map((skId, i) => (
                  <span key={skId} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <span className="chart-dot" style={{ background: COLORS[i % COLORS.length] }} />
                    {skNames[skId]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Detail per Sub-Kategori */}
      {bySubKategori.map((sk, i) => {
        const totalSk = sk.itemCount;
        const maxStatusSk = Math.max(1, ...sk.byStatus.map((s) => s.count));
        return (
          <div
            key={sk.id}
            className="neraca-sub-section"
            style={{ borderLeftColor: COLORS[i % COLORS.length] }}
            onClick={() => onNavigate(`${family}:${kategoriId}:${sk.id}`)}
          >
            <div className="neraca-sub-section-header">
              <span className="neraca-sub-card-dot" style={{ background: COLORS[i % COLORS.length] }} />
              <h3>{sk.nama}</h3>
              <span className="neraca-sub-card-link">Lihat detail &rarr;</span>
            </div>

            <div className="neraca-sub-section-stats">
              <div><span className="label">Item</span><span className="value">{formatNumber(sk.itemCount)}</span></div>
              <div><span className="label">Jumlah</span><span className="value">{formatNumber(sk.jumlah)}</span></div>
              <div><span className="label">Nilai</span><span className="value">{formatRupiah(sk.nilai)}</span></div>
            </div>

            <div className="neraca-sub-section-chart">
              {sk.byStatus.map((s) => (
                <div className="chart-row-sm" key={s.status}>
                  <span style={{ fontSize: 12, minWidth: 60, color: statusTextColors[s.status], fontWeight: 600 }}>{s.status}</span>
                  <span className="chart-track">
                    <span
                      className="chart-fill"
                      style={{
                        width: `${maxStatusSk ? (s.count / maxStatusSk) * 100 : 0}%`,
                        background: statusTextColors[s.status],
                      }}
                    />
                  </span>
                  <b style={{ fontSize: 12, minWidth: 30, textAlign: "right" }}>{s.count}</b>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {unassignedData.length > 0 && (
        <div className="neraca-sub-section" style={{ borderLeftColor: "#94a3b8", opacity: 0.6 }}>
          <div className="neraca-sub-section-header">
            <span className="neraca-sub-card-dot" style={{ background: "#94a3b8" }} />
            <h3 style={{ color: "#94a3b8" }}>Tanpa Sub-Kategori</h3>
          </div>
          <div className="neraca-sub-section-stats">
            <div><span className="label">Item</span><span className="value">{formatNumber(unassignedData.length)}</span></div>
            <div><span className="label">Jumlah</span><span className="value">{formatNumber(unassignedData.reduce((s, d) => s + Number(d.jumlah || 0), 0))}</span></div>
            <div><span className="label">Nilai</span><span className="value">{formatRupiah(unassignedData.reduce((s, d) => s + Number(d.jumlah || 0) * Number(d.harga || 0), 0))}</span></div>
          </div>
        </div>
      )}

      {/* Tabel Data Gabungan */}
      <div className="card mt">
        <div className="card-header">
          <h2>Semua Data ({totalItems} item)</h2>
        </div>
        <div className="table-wrap">
          {totalItems === 0 ? (
            <div className="empty-state">
              <div className="big">📦</div>
              Belum ada data di neraca ini
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("sub_kategori")}>Sub-Kategori<SortIcon col="sub_kategori" /></th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("kode")}>Kode<SortIcon col="kode" /></th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("nama")}>Nama<SortIcon col="nama" /></th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("status")}>Status<SortIcon col="status" /></th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("tanggal")}>Tanggal<SortIcon col="tanggal" /></th>
                  <th className="text-right" style={{ cursor: "pointer" }} onClick={() => toggleSort("jumlah")}>Jumlah<SortIcon col="jumlah" /></th>
                  <th className="text-right" style={{ cursor: "pointer" }} onClick={() => toggleSort("harga")}>Harga<SortIcon col="harga" /></th>
                  <th className="text-right" style={{ cursor: "pointer" }} onClick={() => toggleSort("total")}>Total<SortIcon col="total" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((d, i) => {
                  const nilai = Number(d.jumlah || 0) * Number(d.harga || 0);
                  return (
                    <tr key={d.id}>
                      <td className="text-muted">{i + 1}</td>
                      <td>
                        <span style={{ fontSize: 12, color: "#6b7280" }}>{skMap[d.sub_kategori_id] || "-"}</span>
                      </td>
                      <td className="font-bold">{d.kode}</td>
                      <td>{d.nama}</td>
                      <td><span className={`badge ${statusColors[d.status]}`}>{d.status}</span></td>
                      <td className="text-muted">{d.tanggal ? formatTanggal(d.tanggal) : "-"}</td>
                      <td className="text-right">{formatNumber(d.jumlah)}</td>
                      <td className="text-right">{formatRupiah(d.harga)}</td>
                      <td className="text-right font-bold">{formatRupiah(nilai)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="row-active" style={{ fontWeight: 700 }}>
                  <td colSpan={6}>TOTAL</td>
                  <td className="text-right">{formatNumber(totalJumlah)}</td>
                  <td className="text-right">-</td>
                  <td className="text-right">{formatRupiah(totalNilai)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
