import React from "react";
import { api } from "../api.js";
import Logo from "../components/Logo.jsx";
import { IconAlert, IconFileText, IconRotate, IconTable } from "../components/Icons.jsx";
import "./InputPengolahanNeraca.css";
import "./HasilPengolahanNeraca.css";

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

const TASK_STATUS = {
  submitted: "Menunggu verifikasi",
  completed: "Disetujui",
};

function formatValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numberFormatter.format(numeric) : "—";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function HasilPengolahanNeraca() {
  const [results, setResults] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api.getNeracaResults()
      .then((response) => {
        if (!Array.isArray(response.tasks) || !Array.isArray(response.years)) {
          throw new Error("Format data hasil Neraca dari server tidak valid.");
        }
        if (active) setResults(response);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Gagal memuat hasil Neraca.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const tasks = results?.tasks || [];
  const yearlyResults = results?.years || [];
  const visibleTasks = tasks.filter((task) => statusFilter === "all" || task.status === statusFilter);
  const submittedCount = tasks.filter((task) => task.status === "submitted").length;
  const completedCount = tasks.filter((task) => task.status === "completed").length;

  return (
    <div className="ipn-root hpn-root" data-theme="light">
      <header className="app-header">
        <div className="header-container">
          <div className="brand-wrapper">
            <div className="brand-icon">
              <Logo size={40} />
            </div>
            <div className="brand-info">
              <h1>
                SISNERLING <span className="brand-tag">Hasil Pengolahan</span>
              </h1>
              <p>Rekap agregat hasil input Neraca oleh User Entry</p>
            </div>
          </div>
          <div className="hpn-header-actions">
            <span className="hpn-admin-badge"><IconFileText size={14} /> Khusus Admin</span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading}
            >
              <IconRotate size={14} />
              {loading ? "Memuat..." : "Muat Ulang"}
            </button>
          </div>
        </div>
      </header>

      <div className="hpn-info-banner">
        <IconAlert size={16} />
        <span>
          Rekap menghitung setiap dataset unik satu kali dari sheet <b>Indonesia</b>.
          Hanya tugas yang sudah dikirim atau disetujui yang ditampilkan.
        </span>
      </div>

      {error && (
        <div className="hpn-error" role="alert">
          <b>Hasil belum berhasil dimuat.</b>
          <span>{error}</span>
        </div>
      )}

      <section className="hpn-summary" aria-label="Ringkasan tugas">
        <article className="hpn-summary-card">
          <span>Menunggu verifikasi</span>
          <strong>{loading ? "—" : submittedCount.toLocaleString("id-ID")}</strong>
        </article>
        <article className="hpn-summary-card">
          <span>Sudah disetujui</span>
          <strong>{loading ? "—" : completedCount.toLocaleString("id-ID")}</strong>
        </article>
        <article className="hpn-summary-card">
          <span>Dataset masuk agregat</span>
          <strong>{loading ? "—" : (results?.datasetCount || 0).toLocaleString("id-ID")}</strong>
        </article>
      </section>

      {!!results?.unavailableTaskCount && (
        <div className="hpn-warning" role="status">
          {results.unavailableTaskCount.toLocaleString("id-ID")} tugas tidak dapat diagregasi karena dataset-nya tidak tersedia.
        </div>
      )}

      <section className="hpn-panel">
        <div className="hpn-panel-heading">
          <div className="hpn-panel-icon"><IconTable size={17} /></div>
          <div>
            <h2>Ringkasan Neraca Nasional per Tahun</h2>
            <p>Penjumlahan nilai sheet Indonesia dari dataset yang memiliki tugas terkirim.</p>
          </div>
        </div>
        {loading ? (
          <div className="hpn-empty">Memuat data agregat...</div>
        ) : error ? (
          <div className="hpn-empty">Periksa koneksi ke server, lalu pilih Muat Ulang.</div>
        ) : yearlyResults.length ? (
          <div className="hpn-table-wrap">
            <table className="spreadsheet-grid hpn-grid">
              <thead>
                <tr>
                  <th>Tahun</th>
                  <th>Dataset</th>
                  <th>Persediaan Akhir Fisik</th>
                  <th>Perubahan Neto Fisik</th>
                  <th>Persediaan Akhir Moneter</th>
                </tr>
              </thead>
              <tbody>
                {yearlyResults.map((row) => (
                  <tr key={row.year}>
                    <th scope="row">{row.year}</th>
                    <td>{row.datasetCount.toLocaleString("id-ID")}</td>
                    <td className="cell-formula">{formatValue(row.physicalStock)} <span className="formula-tag">Σ</span></td>
                    <td className="cell-formula">{formatValue(row.physicalChange)} <span className="formula-tag">Σ</span></td>
                    <td className="cell-formula">{formatValue(row.monetaryStock)} <span className="formula-tag">Σ</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hpn-empty">
            Belum ada hasil. Rekap akan terisi setelah User Entry mengirim tugas dari halaman Input &amp; Pengolahan Neraca.
          </div>
        )}
      </section>

      <section className="hpn-panel">
        <div className="hpn-panel-heading hpn-task-heading">
          <div className="hpn-panel-icon"><IconFileText size={17} /></div>
          <div>
            <h2>Sumber Data Terkirim</h2>
            <p>Daftar tugas yang menjadi sumber halaman hasil ini.</p>
          </div>
          <label className="hpn-filter">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Semua</option>
              <option value="submitted">Menunggu verifikasi</option>
              <option value="completed">Disetujui</option>
            </select>
          </label>
        </div>
        {loading ? (
          <div className="hpn-empty">Memuat daftar tugas...</div>
        ) : error ? (
          <div className="hpn-empty">Daftar tugas belum bisa ditampilkan.</div>
        ) : visibleTasks.length ? (
          <div className="hpn-table-wrap">
            <table className="spreadsheet-grid hpn-grid hpn-task-grid">
              <thead>
                <tr>
                  <th>Tugas</th>
                  <th>User Entry</th>
                  <th>Dataset</th>
                  <th>Status</th>
                  <th>Waktu dikirim</th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{task.recipient_name || task.assignee_name || "—"}</td>
                    <td>{task.dataset_name || task.dataset_id}</td>
                    <td>
                      <span className={`hpn-status hpn-status-${task.status}`}>
                        {TASK_STATUS[task.status] || task.status}
                      </span>
                    </td>
                    <td>{formatDate(task.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hpn-empty">
            {tasks.length
              ? "Tidak ada tugas untuk status yang dipilih."
              : "Belum ada tugas yang dikirim oleh User Entry."}
          </div>
        )}
      </section>
    </div>
  );
}
