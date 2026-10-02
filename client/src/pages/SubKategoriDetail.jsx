import React from "react";
import { api, formatNumber, formatRupiah } from "../api.js";
import {
  IconDatabase,
  IconBox,
  IconCoins,
  IconArrowDown,
  IconArrowUp,
  IconGrid,
} from "../components/Icons.jsx";

const COLORS = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626", "#ec4899"];
const statusColors = { Masuk: "masuk", Keluar: "keluar", Pending: "pending" };
const statusIcons = { Masuk: IconArrowDown, Keluar: IconArrowUp, Pending: IconArrowUp };

export default function SubKategoriDetail({ kategoriId, subKategoriId, status, onNavigate }) {
  const [data, setData] = React.useState([]);
  const [kategori, setKategori] = React.useState(null);
  const [subKategori, setSubKategori] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!kategoriId || !subKategoriId) return;
    setLoading(true);
    Promise.all([
      api.getData({ kategoriId, subKategoriId, perPage: 100000, status: status === "Masuk" ? ["Masuk", "Pending"] : status || undefined }),
      api.getKategori(),
      api.getSubKategori(kategoriId),
    ])
      .then(([res, kats, subs]) => {
        setData(res.data || []);
        setKategori(kats.find((k) => String(k.id) === String(kategoriId)));
        setSubKategori(subs.find((s) => String(s.id) === String(subKategoriId)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kategoriId, subKategoriId, status]);

  if (loading) {
    return (
      <div className="loading">
        <div>
          <div className="spinner" />
          <span>Memuat data...</span>
        </div>
      </div>
    );
  }

  const totalItems = data.length;
  const totalJumlah = data.reduce((s, d) => s + Number(d.jumlah || 0), 0);
  const totalNilai = data.reduce((s, d) => s + Number(d.jumlah || 0) * Number(d.harga || 0), 0);
  const avgHarga = totalItems > 0 ? data.reduce((s, d) => s + Number(d.harga || 0), 0) / totalItems : 0;

  const byStatus = ["Masuk", "Keluar", "Pending"].map((s) => ({
    status: s,
    total: data.filter((d) => d.status === s).length,
    jumlah: data.filter((d) => d.status === s).reduce((acc, d) => acc + Number(d.jumlah || 0), 0),
    nilai: data.filter((d) => d.status === s).reduce((acc, d) => acc + Number(d.jumlah || 0) * Number(d.harga || 0), 0),
  })).filter((s) => s.total > 0);
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.total));

  const byMonth = {};
  data.forEach((d) => {
    if (!d.tanggal) return;
    const dt = new Date(d.tanggal);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const label = dt.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
    if (!byMonth[key]) byMonth[key] = { key, label, total: 0, jumlah: 0, nilai: 0 };
    byMonth[key].total++;
    byMonth[key].jumlah += Number(d.jumlah || 0);
    byMonth[key].nilai += Number(d.jumlah || 0) * Number(d.harga || 0);
  });
  const monthlyData = Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key));
  const maxMonthly = Math.max(1, ...monthlyData.map((m) => m.total));

  const maxJumlah = Math.max(1, ...data.map((d) => Number(d.jumlah || 0)));

  const topItems = [...data].sort((a, b) => Number(b.jumlah || 0) * Number(b.harga || 0) - Number(a.jumlah || 0) * Number(a.harga || 0)).slice(0, 5);

  const family = status === "Masuk" ? "input" : status === "Keluar" ? "output" : "input";
  const familyLabel = status === "Masuk" ? "Input" : status === "Keluar" ? "Output" : "Input";

  return (
    <>
      <div className="page-title">
        <p>
          <span className="text-muted" style={{ cursor: "pointer" }} onClick={() => onNavigate(`${family}:${kategoriId}`)}>
            {familyLabel} &middot; {kategori?.nama_kategori || "..."}
          </span>
          {" "}/ {subKategori?.nama || "..."}
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple"><IconDatabase /></div>
          <div className="stat-info">
            <div className="label">Total Item</div>
            <div className="value">{formatNumber(totalItems)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><IconBox /></div>
          <div className="stat-info">
            <div className="label">Total Jumlah</div>
            <div className="value">{formatNumber(totalJumlah)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><IconCoins /></div>
          <div className="stat-info">
            <div className="label">Total Nilai</div>
            <div className="value" style={{ fontSize: 16 }}>{formatRupiah(totalNilai)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><IconGrid /></div>
          <div className="stat-info">
            <div className="label">Rata-rata Harga</div>
            <div className="value" style={{ fontSize: 16 }}>{formatRupiah(avgHarga)}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header"><h2>Data per Status</h2></div>
          <div className="card-body">
            {totalItems === 0 ? (
              <div className="empty-state">Belum ada data</div>
            ) : (
              <div className="chart-bars">
                {byStatus.map((s) => {
                  const pct = totalItems ? Math.round((s.total / totalItems) * 100) : 0;
                  return (
                    <div className="chart-row" key={s.status}>
                      <span><span className={`badge ${statusColors[s.status]}`}>{s.status}</span></span>
                      <span className="chart-track">
                        <span className="chart-fill" style={{ width: `${pct}%` }} />
                      </span>
                      <b>{s.total} <small className="text-muted">({pct}%)</small></b>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Tren Bulanan</h2></div>
          <div className="card-body">
            {monthlyData.length === 0 ? (
              <div className="empty-state">Belum ada data</div>
            ) : (
              <div className="chart-bars">
                {monthlyData.map((m) => (
                  <div className="chart-row" key={m.key}>
                    <span style={{ minWidth: 90, fontSize: 12 }}>{m.label}</span>
                    <span className="chart-track">
                      <span className="chart-fill" style={{ width: `${(m.total / maxMonthly) * 100}%` }} />
                    </span>
                    <b>{m.total}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {topItems.length > 0 && (
        <div className="card mt">
          <div className="card-header">
            <h2>Top 5 Item berdasarkan Nilai</h2>
          </div>
          <div className="card-body">
            <div className="chart-bars">
              {topItems.map((d, i) => {
                const nilai = Number(d.jumlah || 0) * Number(d.harga || 0);
                const maxTopNilai = Number(topItems[0].jumlah || 0) * Number(topItems[0].harga || 0);
                return (
                  <div className="chart-row" key={d.id}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
                      <span className="chart-dot" style={{ background: COLORS[i % COLORS.length] }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <b>{d.kode}</b> {d.nama}
                      </span>
                    </span>
                    <span className="chart-track">
                      <span className="chart-fill" style={{ width: `${maxTopNilai ? (nilai / maxTopNilai) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                    </span>
                    <b style={{ whiteSpace: "nowrap" }}>{formatRupiah(nilai)}</b>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="card mt">
        <div className="card-header">
          <h2>Semua Item ({totalItems})</h2>
        </div>
        <div className="card-body">
          {totalItems === 0 ? (
            <div className="empty-state">
              <div className="big"><IconDatabase size={42} /></div>
              Belum ada data di sub-kategori ini
            </div>
          ) : (
            <div className="chart-bars">
              {data.map((d) => {
                const nilai = Number(d.jumlah || 0) * Number(d.harga || 0);
                return (
                  <div className="chart-row" key={d.id}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220, fontSize: 13 }}>
                      <span className={`badge badge-sm ${statusColors[d.status]}`}>{d.status.charAt(0)}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <b>{d.kode}</b> {d.nama}
                      </span>
                    </span>
                    <span className="chart-track">
                      <span className="chart-fill" style={{ width: `${maxJumlah ? (Number(d.jumlah || 0) / maxJumlah) * 100 : 0}%` }} />
                    </span>
                    <span style={{ whiteSpace: "nowrap", fontSize: 12, minWidth: 120, textAlign: "right" }}>
                      {formatNumber(d.jumlah)} &middot; {formatRupiah(nilai)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
