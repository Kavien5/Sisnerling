import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import Modal from "./Modal.jsx";
import { api, formatNumber } from "../api.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title);

// Warna status yang dipakai konsisten di seluruh grafik & kartu.
const STATUS_COLORS = {
  selesai: "#22c55e",
  sedang: "#f59e0b",
  belum: "#ef4444",
};
const STATUS_LABELS = {
  selesai: "Selesai",
  sedang: "Sedang Dikerjakan",
  belum: "Belum Dikerjakan",
};

function ProgressBar({ selesai, tugas, persen }) {
  const p = Number.isFinite(persen) ? persen : (tugas > 0 ? Math.round((selesai / tugas) * 100) : 0);
  return (
    <div className="apg-bar" title={`${p}% selesai`}>
      <div className="apg-bar-fill" style={{ width: `${p}%` }} />
      <span className="apg-bar-label">{p}%</span>
    </div>
  );
}

export default function AssignmentProgressCharts({ user }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [detail, setDetail] = React.useState(null);
  const isSuper = !!(user && user.role === "super_admin");

  const load = React.useCallback(async () => {
    try {
      const res = await api.getAssignmentProgress();
      setData(res);
      setError("");
    } catch (err) {
      setError(err.message || "Gagal memuat progres penugasan");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Segarkan saat jendela kembali fokus dan berkala: data berubah begitu Admin
  // melakukan entry/edit pada tabel yang ditugaskan.
  React.useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const t = setInterval(load, 60000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [load]);

  const totals = (data && data.totals) || { tugas: 0, belum: 0, sedang: 0, selesai: 0, persen: 0 };
  const hasData = !!(data && totals.tugas > 0);

  const openDetail = React.useCallback((filter) => setDetail({ filter }), []);

  const filteredDetails = React.useMemo(() => {
    if (!data) return [];
    const all = Array.isArray(data.details) ? data.details : [];
    const f = detail && detail.filter;
    if (!f) return all;
    return all.filter((d) => {
      if (f.adminId != null && Number(d.adminId) !== Number(f.adminId)) return false;
      if (f.workbookKey != null && String(d.workbookKey) !== String(f.workbookKey)) return false;
      if (f.sheetId != null && Number(d.sheetId) !== Number(f.sheetId)) return false;
      if (f.status) {
        if (f.status === "belum" && !(d.belum > 0)) return false;
        if (f.status === "sedang" && !(d.sedang > 0)) return false;
        if (f.status === "selesai" && !(d.selesai > 0)) return false;
      }
      return true;
    });
  }, [data, detail]);

  const detailSummary = React.useMemo(() => {
    const acc = { tugas: 0, belum: 0, sedang: 0, selesai: 0 };
    for (const d of filteredDetails) {
      acc.tugas += d.tugas; acc.belum += d.belum; acc.sedang += d.sedang; acc.selesai += d.selesai;
    }
    acc.persen = acc.tugas > 0 ? Math.round((acc.selesai / acc.tugas) * 100) : 0;
    return acc;
  }, [filteredDetails]);

  if (loading && !data) {
    return (
      <div className="card mt">
        <div className="card-header"><h2>Progres Penugasan Admin</h2></div>
        <div className="empty-state" style={{ padding: "28px 16px" }}>Memuat progres penugasan…</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card mt">
        <div className="card-header"><h2>Progres Penugasan Admin</h2></div>
        <div className="empty-state" style={{ padding: "28px 16px" }}>
          {error}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-sm" onClick={load}>Coba lagi</button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="card mt">
        <div className="card-header">
          <h2>Progres Penugasan Admin</h2>
          <button type="button" className="btn btn-sm" onClick={load} title="Muat ulang progres">↻ Muat Ulang</button>
        </div>
        <div className="empty-state">
          <div className="big">&#128203;</div>
          <p>
            Belum ada penugasan tabel. Buka halaman <b>Penugasan Tabel</b> untuk menugaskan
            file/sheet kepada Admin, lalu progres akan tampil di sini secara otomatis.
          </p>
        </div>
      </div>
    );
  }

  const byAdmin = Array.isArray(data.byAdmin) ? data.byAdmin : [];
  const byFile = Array.isArray(data.byFile) ? data.byFile : [];

  const adminBarData = {
    labels: byAdmin.map((a) => a.nama),
    datasets: [
      { label: STATUS_LABELS.belum, data: byAdmin.map((a) => a.belum), backgroundColor: STATUS_COLORS.belum, stack: "status", borderColor: "#fff", borderWidth: 1 },
      { label: STATUS_LABELS.sedang, data: byAdmin.map((a) => a.sedang), backgroundColor: STATUS_COLORS.sedang, stack: "status", borderColor: "#fff", borderWidth: 1 },
      { label: STATUS_LABELS.selesai, data: byAdmin.map((a) => a.selesai), backgroundColor: STATUS_COLORS.selesai, stack: "status", borderColor: "#fff", borderWidth: 1 },
    ],
  };

  const fileBarData = {
    labels: byFile.map((f) => f.workbookName || f.workbookKey),
    datasets: [
      { label: STATUS_LABELS.belum, data: byFile.map((f) => f.belum), backgroundColor: STATUS_COLORS.belum, stack: "status", borderColor: "#fff", borderWidth: 1 },
      { label: STATUS_LABELS.sedang, data: byFile.map((f) => f.sedang), backgroundColor: STATUS_COLORS.sedang, stack: "status", borderColor: "#fff", borderWidth: 1 },
      { label: STATUS_LABELS.selesai, data: byFile.map((f) => f.selesai), backgroundColor: STATUS_COLORS.selesai, stack: "status", borderColor: "#fff", borderWidth: 1 },
    ],
  };

  const donutData = {
    labels: [STATUS_LABELS.selesai, STATUS_LABELS.sedang, STATUS_LABELS.belum],
    datasets: [{
      data: [totals.selesai, totals.sedang, totals.belum],
      backgroundColor: [STATUS_COLORS.selesai, STATUS_COLORS.sedang, STATUS_COLORS.belum],
      borderColor: "#fff",
      borderWidth: 2,
    }],
  };

  const stackedOptions = (onClick) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", labels: { usePointStyle: true, font: { size: 11 } } },
      tooltip: { backgroundColor: "rgba(15,23,42,0.9)" },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { stacked: true, beginAtZero: true, grid: { color: "rgba(0,0,0,0.06)" } },
    },
    onClick,
  });

  const adminClick = (_e, els) => {
    if (els && els.length) {
      const a = byAdmin[els[0].index];
      if (a) openDetail({ adminId: a.adminId });
    }
  };
  const fileClick = (_e, els) => {
    if (els && els.length) {
      const f = byFile[els[0].index];
      if (f) openDetail({ workbookKey: f.workbookKey });
    }
  };
  const donutClick = (_e, els) => {
    if (els && els.length) {
      const status = ["selesai", "sedang", "belum"][els[0].index];
      if (status) openDetail({ status });
    }
  };

  return (
    <div className="sv-charts-wrap mt">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><span style={{ fontSize: 18 }}>&#128203;</span></div>
          <div className="stat-info">
            <div className="label">Total Tugas</div>
            <div className="value">{formatNumber(totals.tugas)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><span style={{ fontSize: 18 }}>&#9203;</span></div>
          <div className="stat-info">
            <div className="label">Belum Dikerjakan</div>
            <div className="value">{formatNumber(totals.belum)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><span style={{ fontSize: 18 }}>&#9997;</span></div>
          <div className="stat-info">
            <div className="label">Sedang Dikerjakan</div>
            <div className="value">{formatNumber(totals.sedang)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><span style={{ fontSize: 18 }}>&#9989;</span></div>
          <div className="stat-info">
            <div className="label">Selesai</div>
            <div className="value">{formatNumber(totals.selesai)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><span style={{ fontSize: 18 }}>&#128200;</span></div>
          <div className="stat-info">
            <div className="label">Progres Keseluruhan</div>
            <div className="value">{totals.persen}%</div>
          </div>
        </div>
      </div>

      <div className="card apg-card">
        <div className="card-header">
          <h2>Progres Penugasan Admin{isSuper ? "" : " (Anda)"}</h2>
          <div className="apg-head-actions">
            <span className="apg-hint">Klik batang untuk melihat detail</span>
            <button type="button" className="btn btn-sm" onClick={load} title="Muat ulang progres">↻</button>
          </div>
        </div>
        <div className="sv-chart-card">
          <div className="sv-chart-canvas">
            <Bar data={adminBarData} options={stackedOptions(adminClick)} />
          </div>
        </div>
      </div>

      <div className="sv-chart-row">
        <div className="card sv-chart-card">
          <div className="card-header"><h2>Distribusi Status Tugas</h2></div>
          <div className="sv-chart-canvas">
            <Doughnut data={donutData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: "bottom", labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
                tooltip: { backgroundColor: "rgba(15,23,42,0.9)" },
              },
              onClick: donutClick,
            }} />
          </div>
        </div>
        <div className="card sv-chart-card">
          <div className="card-header"><h2>Progres per File</h2></div>
          <div className="sv-chart-canvas">
            <Bar data={fileBarData} options={stackedOptions(fileClick)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Ringkasan Progres per Admin</h2>
          <button type="button" className="btn btn-sm" onClick={() => openDetail({})}>Lihat Semua Detail</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Admin</th>
                <th style={{ width: 90 }}>Tugas</th>
                <th style={{ width: 90 }}>Belum</th>
                <th style={{ width: 90 }}>Sedang</th>
                <th style={{ width: 90 }}>Selesai</th>
                <th style={{ width: 160 }}>Progres</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {byAdmin.map((a) => (
                <tr key={a.adminId}>
                  <td className="font-bold">{a.nama}</td>
                  <td>{formatNumber(a.tugas)}</td>
                  <td className="apg-td-belum">{formatNumber(a.belum)}</td>
                  <td className="apg-td-sedang">{formatNumber(a.sedang)}</td>
                  <td className="apg-td-selesai">{formatNumber(a.selesai)}</td>
                  <td><ProgressBar selesai={a.selesai} tugas={a.tugas} persen={a.persen} /></td>
                  <td>
                    <button type="button" className="btn btn-sm" onClick={() => openDetail({ adminId: a.adminId })}>Detail</button>
                  </td>
                </tr>
              ))}
              {byAdmin.length === 0 && (
                <tr><td colSpan="7"><div className="empty-state">Belum ada Admin dengan tugas.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <Modal
          title="Detail Progres Penugasan"
          width="1080px"
          onClose={() => setDetail(null)}
          footer={<button type="button" className="btn btn-primary" onClick={() => setDetail(null)}>Tutup</button>}
        >
          <div className="apg-detail-summary">
            <span className="apg-sum-item"><b>{formatNumber(detailSummary.tugas)}</b> total tugas</span>
            <span className="apg-sum-item apg-td-belum"><b>{formatNumber(detailSummary.belum)}</b> belum</span>
            <span className="apg-sum-item apg-td-sedang"><b>{formatNumber(detailSummary.sedang)}</b> sedang</span>
            <span className="apg-sum-item apg-td-selesai"><b>{formatNumber(detailSummary.selesai)}</b> selesai</span>
            <span className="apg-sum-item"><b>{detailSummary.persen}%</b> progres</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: "56vh", overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>File</th>
                  <th>Sheet</th>
                  <th>Bagian Tabel</th>
                  <th style={{ width: 70 }}>Tugas</th>
                  <th style={{ width: 70 }}>Belum</th>
                  <th style={{ width: 70 }}>Sedang</th>
                  <th style={{ width: 70 }}>Selesai</th>
                  <th style={{ width: 140 }}>Progres</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.map((d, i) => (
                  <tr key={`${d.adminId}-${d.sheetId}-${d.level}-${d.bagian}-${i}`}>
                    <td className="font-bold">{d.nama_admin}</td>
                    <td>{d.workbookName || d.workbookKey}</td>
                    <td>{d.sheetName}</td>
                    <td><span className="badge apg-level-badge">{d.level}</span> {d.bagian}</td>
                    <td>{formatNumber(d.tugas)}</td>
                    <td className="apg-td-belum">{formatNumber(d.belum)}</td>
                    <td className="apg-td-sedang">{formatNumber(d.sedang)}</td>
                    <td className="apg-td-selesai">{formatNumber(d.selesai)}</td>
                    <td><ProgressBar selesai={d.selesai} tugas={d.tugas} persen={d.persen} /></td>
                  </tr>
                ))}
                {filteredDetails.length === 0 && (
                  <tr><td colSpan="9"><div className="empty-state">Tidak ada detail untuk pilihan ini.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="apg-note">
            Progres dihitung dari data nyata pada tabel yang ditugaskan: baris <b>selesai</b> bila semua kolom
            yang ditugaskan terisi, <b>sedang</b> bila sebagian, dan <b>belum</b> bila belum ada isian.
          </p>
        </Modal>
      )}
    </div>
  );
}
