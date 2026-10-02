import React from "react";
import { api } from "../api.js";
import Modal from "../components/Modal.jsx";
import { IconSearch, IconHistory, IconUser, IconX } from "../components/Icons.jsx";
import { roleLabel } from "../auth.js";

const ACTION_LABELS = {
  import: "Import data",
  edit: "Mengubah data",
  delete: "Menghapus data",
  export: "Mengekspor data",
  clean: "Membersihkan data",
  create: "Menambah data",
  update: "Memperbarui data",
  restore: "Memulihkan data",
  login: "Login",
  register: "Registrasi",
  logout: "Logout",
  klasifikasi: "Klasifikasi / memindahkan data",
};

const MODULE_LABELS = {
  auth: "Autentikasi",
  kategori: "Kategori",
  data: "Data",
  spreadsheet: "Spreadsheet",
  import: "Import",
  export: "Export",
  riwayat: "Riwayat",
  user: "Akun",
  permission: "Izin Tabel",
  maintenance: "Maintenance",
  settings: "Pengaturan",
  backup: "Backup",
  system: "Sistem",
};

const ACTION_COLORS = {
  create: { bg: "#ecfdf5", fg: "#047857" },
  update: { bg: "#eef2ff", fg: "#4338ca" },
  edit: { bg: "#eef2ff", fg: "#4338ca" },
  delete: { bg: "#fef2f2", fg: "#b91c1c" },
  clean: { bg: "#fef2f2", fg: "#b91c1c" },
  export: { bg: "#f5f3ff", fg: "#6d28d9" },
  import: { bg: "#f5f3ff", fg: "#6d28d9" },
  login: { bg: "#ecfdf5", fg: "#047857" },
  register: { bg: "#ecfdf5", fg: "#047857" },
  logout: { bg: "#fdf2f8", fg: "#be185d" },
  restore: { bg: "#fffbeb", fg: "#b45309" },
  klasifikasi: { bg: "#f0f9ff", fg: "#0369a1" },
};

function actionLabel(a) {
  return ACTION_LABELS[a] || a;
}

function moduleLabel(m) {
  return MODULE_LABELS[m] || m;
}

function badgeStyle(action) {
  const c = ACTION_COLORS[action] || { bg: "#f3f4f6", fg: "#374151" };
  return {
    display: "inline-block",
    padding: "2px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
    background: c.bg,
    color: c.fg,
  };
}

const fmtFull = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
};

const fmtVal = (v) => {
  if (v === null || v === undefined) return "–";
  if (v === true || v === false) return v ? "Ya" : "Tidak";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

function buildDiffRows(oldObj, newObj) {
  const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
  const rows = [];
  keys.forEach((k) => {
    rows.push({ field: k, before: oldObj ? oldObj[k] : undefined, after: newObj ? newObj[k] : undefined });
  });
  rows.sort((a, b) => a.field.localeCompare(b.field));
  return rows;
}

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

export default function AuditLogs({ user }) {
  const [q, setQ] = React.useState("");
  const [qInput, setQInput] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [action, setAction] = React.useState("");
  const [module, setModule] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(20);

  const [data, setData] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  const [meta, setMeta] = React.useState({ users: [], actions: [], modules: [] });
  const [detail, setDetail] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  React.useEffect(() => {
    api
      .getAuditMeta()
      .then(setMeta)
      .catch(() => {});
  }, []);

  const fetchLogs = React.useCallback(
    async (p = page, pp = perPage) => {
      setLoading(true);
      try {
        const res = await api.getAuditLogs({
          page: p,
          perPage: pp,
          q: q.trim() || undefined,
          userId: userId || undefined,
          action: action || undefined,
          module: module || undefined,
          from: from || undefined,
          to: to || undefined,
        });
        setData(res.data || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        setPage(res.page || 1);
      } catch (err) {
        setData([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [page, perPage, q, userId, action, module, from, to]
  );

  React.useEffect(() => {
    fetchLogs(1, perPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, userId, action, module, from, to, perPage]);

  const goPage = (p) => {
    if (p < 1 || p > totalPages) return;
    fetchLogs(p, perPage);
  };

  const applySearch = () => {
    setQ(qInput.trim());
    setPage(1);
  };

  const openDetail = async (row) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      const full = await api.getAuditLogDetail(row.id);
      setDetail(full);
    } catch {
      /* biarkan baris list*/
    } finally {
      setDetailLoading(false);
    }
  };

  const hasFilters = !!(q || userId || action || module || from || to);

  const resetFilters = () => {
    setQInput("");
    setQ("");
    setUserId("");
    setAction("");
    setModule("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Audit Log</h2>
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Jejak aktivitas pengguna di seluruh sistem (khusus Super Admin).</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="filter-grid">
            <div className="search-box" style={{ flex: "1 1 220px" }}>
              <span className="search-icon"><IconSearch size={15} /></span>
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                placeholder="Cari deskripsi / modul..."
              />
            </div>
            <select className="select-filter" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Semua pengguna</option>
              {meta.users.map((u) => (
                <option key={u.id} value={u.id}>{u.nama} ({u.email})</option>
              ))}
            </select>
            <select className="select-filter" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">Semua aktivitas</option>
              {meta.actions.map((a) => (
                <option key={a} value={a}>{actionLabel(a)}</option>
              ))}
            </select>
            <select className="select-filter" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">Semua modul</option>
              {meta.modules.map((m) => (
                <option key={m} value={m}>{moduleLabel(m)}</option>
              ))}
            </select>
            <label className="filter-date">
              <span>Dari</span>
              <input type="date" className="form-control" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="filter-date">
              <span>Sampai</span>
              <input type="date" className="form-control" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button className="btn btn-primary" onClick={applySearch}>Terapkan</button>
            {hasFilters && (
              <button className="btn btn-outline" onClick={resetFilters}>
                <IconX size={13} /> Reset
              </button>
            )}
          </div>
        </div>

        <div className="toolbar" style={{ padding: "0 18px 4px" }}>
          <span className="pagination-info" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IconHistory size={14} /> {total.toLocaleString("id-ID")} entri tercatat
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="pagination-info">Per halaman</span>
            <select
              className="select-filter"
              style={{ padding: "6px 8px", fontSize: 12 }}
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Pengguna</th>
                <th>Aktivitas</th>
                <th>Modul</th>
                <th>Deskripsi</th>
                <th>IP</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">Memuat log...</div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="big"><IconHistory size={42} /></div>
                      Tidak ada log yang cocok
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((r) => (
                  <tr key={r.id}>
                    <td className="text-nowrap">{fmtFull(r.created_at)}</td>
                    <td>
                      {r.nama_user ? (
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontWeight: 600 }}>{r.nama_user}</span>
                          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{roleLabel(r.role_user || "user")}</span>
                        </span>
                      ) : (
                        <span className="text-muted">(akun terhapus)</span>
                      )}
                    </td>
                    <td><span style={badgeStyle(r.action)}>{actionLabel(r.action)}</span></td>
                    <td>{moduleLabel(r.module)}</td>
                    <td style={{ maxWidth: 420 }}>{r.description || "-"}</td>
                    <td className="text-nowrap" style={{ color: "var(--ink-3)", fontSize: 12 }}>{r.ip_address || "-"}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => openDetail(r)}>
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && total > 0 && (
          <div className="pagination">
            <span className="pagination-info">
              Menampilkan {data.length} dari {total} log &middot; Halaman {page} dari {totalPages}
            </span>
            <div className="page-btns">
              <button className="page-btn" disabled={page <= 1} onClick={() => goPage(page - 1)}>&lsaquo;</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-muted" style={{ padding: "0 2px" }}>...</span>}
                    <button className={`page-btn${p === page ? " active" : ""}`} onClick={() => goPage(p)}>{p}</button>
                  </React.Fragment>
                ))}
              <button className="page-btn" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>&rsaquo;</button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <Modal title="Detail Audit Log" onClose={() => setDetail(null)} width="780px">
          <div className="audit-detail-meta">
            <div>
              <span className="text-muted">Waktu</span>
              <strong>{fmtFull(detail.created_at)}</strong>
            </div>
            <div>
              <span className="text-muted">Pengguna</span>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconUser size={14} />
                {detail.nama_user ? `${detail.nama_user} (${detail.email_user || ""})` : "—"}
              </strong>
            </div>
            <div>
              <span className="text-muted">Aktivitas</span>
              <strong><span style={badgeStyle(detail.action)}>{actionLabel(detail.action)}</span></strong>
            </div>
            <div>
              <span className="text-muted">Modul</span>
              <strong>{moduleLabel(detail.module)}</strong>
            </div>
            {detail.ip_address && (
              <div>
                <span className="text-muted">IP Address</span>
                <strong>{detail.ip_address}</strong>
              </div>
            )}
          </div>
          {detail.description && (
            <div className="audit-detail-desc">
              <span className="text-muted">Deskripsi</span>
              <p>{detail.description}</p>
            </div>
          )}

          {detailLoading ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>Memuat detail...</div>
          ) : detail.old_data || detail.new_data ? (
            <div className="diff-wrap">
              <table className="table diff-table">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Field</th>
                    <th>Sebelum</th>
                    <th>Sesudah</th>
                  </tr>
                </thead>
                <tbody>
                  {buildDiffRows(detail.old_data, detail.new_data).map((r) => (
                    <tr key={r.field}>
                      <td style={{ fontWeight: 600 }}>{r.field}</td>
                      <td className={r.after !== undefined && String(r.before) !== String(r.after) ? "diff-old" : ""}>
                        {fmtVal(r.before)}
                      </td>
                      <td className={r.after !== undefined && String(r.before) !== String(r.after) ? "diff-new" : ""}>
                        {fmtVal(r.after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!("old_data" in detail) && !detail.old_data && !detail.new_data && null}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "16px 0" }}>Tidak ada perubahan data yang tersimpan.</div>
          )}
        </Modal>
      )}
    </div>
  );
}