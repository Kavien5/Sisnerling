import React from "react";
import { api } from "../api.js";
import Modal from "../components/Modal.jsx";
import "./AuditLogs.css";
import {
  IconSearch,
  IconHistory,
  IconUser,
  IconX,
  IconArchive,
  IconUndo,
  IconAlert,
  IconCheck,
  IconBookmark,
  IconRotate,
  IconArrowDown,
} from "../components/Icons.jsx";
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
  pulihkan: "Memulihkan data",
};

const MODULE_LABELS = {
  auth: "Autentikasi",
  kategori: "Kategori",
  data: "Data",
  spreadsheet: "Spreadsheet",
  statistical: "Spreadsheet Statistik",
  import: "Import",
  export: "Export",
  riwayat: "Riwayat",
  user: "Akun",
  permission: "Izin Tabel",
  maintenance: "Maintenance",
  settings: "Pengaturan",
  backup: "Backup",
  system: "Sistem",
  collab: "Spreadsheet",
  neraca: "Input & Pengolahan Neraca",
  audit: "Audit Log",
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
  pulihkan: { bg: "#fffbeb", fg: "#b45309" },
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

function expiryWarning(row, now) {
  if (Boolean(Number(row.is_saved)) || Boolean(Number(row.is_archived))) return null;
  const expiry = new Date(row.expires_at || new Date(row.created_at).getTime() + 3 * 24 * 60 * 60 * 1000);
  const remaining = expiry.getTime() - now;
  if (!Number.isFinite(remaining) || remaining > 24 * 60 * 60 * 1000) return null;
  if (remaining <= 0) return { text: "Segera dihapus", urgent: true };
  const minutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return {
    text: hours > 0 ? `Habis dalam ${hours} jam ${restMinutes} menit` : `Habis dalam ${minutes} menit`,
    urgent: remaining <= 6 * 60 * 60 * 1000,
  };
}

function groupLogsByUser(logs) {
  const groups = new Map();
  logs.forEach((log) => {
    const name = log.nama_user || "(akun terhapus)";
    const role = log.role_user || "user";
    const key = log.user_id ? `user:${log.user_id}` : `account:${role}:${name}`;
    if (!groups.has(key)) groups.set(key, { key, userId: log.user_id, name, role, logs: [] });
    groups.get(key).logs.push(log);
  });
  return Array.from(groups.values());
}

function userInitials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

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
  if (user?.role !== "super_admin") return <ReadOnlyAuditLogs />;
  return <SuperAdminAuditLogs user={user} />;
}

function ReadOnlyAuditLogs() {
  const [data, setData] = React.useState([]);
  const [expandedGroups, setExpandedGroups] = React.useState(new Set());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    let timeout;
    const load = (showLoading = false) => {
      if (showLoading) setLoading(true);
      if (showLoading) setError("");
      api.getAuditLogs({ page: 1, perPage: 50, scope: "all" })
        .then((res) => {
          if (active) setData(res.data || []);
        })
        .catch((err) => {
          if (active && showLoading) setError(err.message || "Gagal memuat catatan aktivitas");
        })
        .finally(() => {
          if (active && showLoading) setLoading(false);
          if (active) timeout = setTimeout(() => load(), 30000);
        });
    };
    load(true);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [refreshKey]);

  const groups = groupLogsByUser(data);
  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="page-container audit-page audit-page-readonly">
      <div className="page-header audit-page-header">
        <div className="audit-title">
          <span className="audit-title-icon"><IconHistory size={21} /></span>
          <div>
            <h2>Aktivitas Sistem</h2>
            <p>Ringkasan aktivitas terbaru dari seluruh akun.</p>
          </div>
        </div>
        <button className="btn btn-outline audit-refresh" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
          <IconRotate size={14} />
          Muat ulang
        </button>
      </div>
      <div className="table-wrap audit-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Pengguna</th>
              <th>Aktivitas</th>
              <th>Modul</th>
              <th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}><div className="empty-state">Memuat catatan aktivitas...</div></td></tr>
            ) : error ? (
              <tr><td colSpan={5}><div className="empty-state">{error}</div></td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={5}><div className="empty-state">Belum ada catatan aktivitas</div></td></tr>
            ) : groups.map((group) => (
              <React.Fragment key={group.key}>
                <tr className="audit-group-header">
                  <td colSpan={5}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={expandedGroups.has(group.key)}
                      className="audit-account-toggle"
                    >
                      <span className="audit-chevron"><IconArrowDown size={15} /></span>
                      <span className="audit-avatar">{userInitials(group.name)}</span>
                      <span className="audit-account-name">
                        <strong>{group.name}</strong>
                        <span>{roleLabel(group.role)}</span>
                      </span>
                      <span className="audit-account-count">{group.logs.length} aktivitas</span>
                    </button>
                  </td>
                </tr>
                {expandedGroups.has(group.key) && group.logs.map((row) => (
                  <tr key={row.id} className="audit-log-row">
                    <td className="text-nowrap">{fmtFull(row.created_at)}</td>
                    <td style={{ paddingLeft: 28 }}>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{row.nama_user || "(akun terhapus)"}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{roleLabel(row.role_user || "user")}</span>
                      </span>
                    </td>
                    <td><span style={badgeStyle(row.action)}>{actionLabel(row.action)}</span></td>
                    <td>{moduleLabel(row.module)}</td>
                    <td>{row.description || "-"}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuperAdminAuditLogs({ user }) {
  const [q, setQ] = React.useState("");
  const [qInput, setQInput] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [action, setAction] = React.useState("");
  const [module, setModule] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [scope, setScope] = React.useState("active"); // 'active' (72 jam), 'archived', 'all'
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(20);

  const [data, setData] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  // Status retensi & peringatan
  const [retentionStatus, setRetentionStatus] = React.useState({
    total_active: 0,
    total_archived: 0,
    expiring_soon: 0,
    total_snapshots: 0,
    retention_hours: 72,
    warning_hours: 24,
  });

  // Checklist batch selection
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [expandedGroups, setExpandedGroups] = React.useState(new Set());

  // Modal states
  const [detail, setDetail] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [savingIds, setSavingIds] = React.useState([]);
  const [deletingIds, setDeletingIds] = React.useState([]);
  const [saveError, setSaveError] = React.useState("");
  const [clockNow, setClockNow] = React.useState(Date.now());

  React.useEffect(() => {
    const interval = setInterval(() => setClockNow(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Restore Modal State
  const [restoreModal, setRestoreModal] = React.useState(null);
  const [restorePreview, setRestorePreview] = React.useState(null);
  const [restoreLoading, setRestoreLoading] = React.useState(false);
  const [restoreExecuting, setRestoreExecuting] = React.useState(false);

  // Notifikasi / Alert Banner
  const [toast, setToast] = React.useState(null);
  const [showGuide, setShowGuide] = React.useState(false);

  const [meta, setMeta] = React.useState({ users: [], actions: [], modules: [] });
  const logGroups = groupLogsByUser(data);

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllGroups = () => {
    const allExpanded = logGroups.length > 0 && logGroups.every((group) => expandedGroups.has(group.key));
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      logGroups.forEach((group) => {
        if (allExpanded) next.delete(group.key);
        else next.add(group.key);
      });
      return next;
    });
  };
  const allGroupsExpanded = logGroups.length > 0 && logGroups.every((group) => expandedGroups.has(group.key));

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadRetentionStatus = React.useCallback(async () => {
    try {
      const res = await api.getAuditRetentionStatus();
      setRetentionStatus(res);
    } catch {
      // Abaikan jika gagal
    }
  }, []);

  React.useEffect(() => {
    api.getAuditMeta().then(setMeta).catch(() => {});
    loadRetentionStatus();
  }, [loadRetentionStatus]);

  const fetchLogs = React.useCallback(
    async (p = page, pp = perPage, sc = scope, { quiet = false } = {}) => {
      if (!quiet) setLoading(true);
      try {
        const res = await api.getAuditLogs({
          page: p,
          perPage: pp,
          scope: sc,
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
        if (!quiet) setSelectedIds([]);
      } catch (err) {
        if (!quiet) {
          setData([]);
          setTotal(0);
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [page, perPage, scope, q, userId, action, module, from, to]
  );

  React.useEffect(() => {
    fetchLogs(1, perPage, scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, userId, action, module, from, to, perPage, scope]);

  React.useEffect(() => {
    let active = true;
    let timeout;
    const poll = async () => {
      await fetchLogs(page, perPage, scope, { quiet: true });
      if (active) timeout = setTimeout(poll, 30000);
    };
    timeout = setTimeout(poll, 30000);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [fetchLogs, page, perPage, scope]);

  const goPage = (p) => {
    if (p < 1 || p > totalPages) return;
    fetchLogs(p, perPage, scope);
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
      /* biarkan baris list */
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleSaved = async (row) => {
    const isSaved = !Boolean(Number(row.is_saved));
    setSaveError("");
    setSavingIds((ids) => [...ids, row.id]);
    try {
      await api.setAuditLogSaved(row.id, isSaved);
      setData((rows) => rows.map((item) => item.id === row.id ? { ...item, is_saved: isSaved ? 1 : 0 } : item));
      setDetail((item) => item && item.id === row.id ? { ...item, is_saved: isSaved ? 1 : 0 } : item);
    } catch (err) {
      setSaveError(err.message || "Status simpan audit log gagal diperbarui.");
    } finally {
      setSavingIds((ids) => ids.filter((id) => id !== row.id));
    }
  };

  const deleteLog = async (row) => {
    if (!window.confirm(`Hapus audit log "${row.description || row.action}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setSaveError("");
    setDeletingIds((ids) => [...ids, row.id]);
    try {
      await api.deleteAuditLog(row.id);
      setData((rows) => rows.filter((item) => item.id !== row.id));
      setTotal((count) => Math.max(0, count - 1));
      setDetail((item) => item && item.id === row.id ? null : item);
      if (data.length === 1 && page > 1) {
        await fetchLogs(page - 1, perPage);
      }
    } catch (err) {
      setSaveError(err.message || "Audit log gagal dihapus.");
    } finally {
      setDeletingIds((ids) => ids.filter((id) => id !== row.id));
    }
  };

  // Buka Pratinjau Restore (3 Kolom + Deteksi Konflik)
  const openRestoreModal = async (row) => {
    setRestoreModal(row);
    setRestorePreview(null);
    setRestoreLoading(true);
    try {
      const preview = await api.getAuditRestorePreview(row.id);
      setRestorePreview(preview);
    } catch (err) {
      showToast(err.message || "Gagal memuat pratinjau pemulihan", "error");
      setRestoreModal(null);
    } finally {
      setRestoreLoading(false);
    }
  };

  // Eksekusi Pemulihan
  const confirmRestore = async () => {
    if (!restoreModal) return;
    setRestoreExecuting(true);
    try {
      const res = await api.executeAuditRestore(restoreModal.id);
      showToast(res.message || "Data berhasil dipulihkan!", "success");
      setRestoreModal(null);
      setRestorePreview(null);
      fetchLogs(page, perPage, scope);
      loadRetentionStatus();
    } catch (err) {
      showToast(err.message || "Gagal memulihkan data", "error");
    } finally {
      setRestoreExecuting(false);
    }
  };

  // Toggle Arsip / Simpan Riwayat
  const handleToggleArchive = async (row) => {
    try {
      if (row.is_archived) {
        await api.unarchiveAuditLog(row.id);
        showToast(`Log #${row.id} dikembalikan ke riwayat aktif (72 jam)`);
      } else {
        await api.archiveAuditLog(row.id);
        showToast(`Log #${row.id} berhasil disimpan/diarsipkan secara permanen`);
      }
      fetchLogs(page, perPage, scope);
      loadRetentionStatus();
    } catch (err) {
      showToast(err.message || "Gagal mengubah status arsip", "error");
    }
  };

  // Arsipkan Semua yang Akan Kedaluwarsa
  const handleArchiveExpiring = async () => {
    if (!window.confirm("Simpan semua riwayat aktivitas yang akan kedaluwarsa dalam 24 jam ke depan agar tidak terhapus otomatis?")) {
      return;
    }
    try {
      const res = await api.archiveExpiringAuditLogs();
      showToast(res.message || "Riwayat berhasil disimpan", "success");
      fetchLogs(page, perPage, scope);
      loadRetentionStatus();
    } catch (err) {
      showToast(err.message || "Gagal mengarsipkan log", "error");
    }
  };

  // Batch Archive untuk baris terpilih
  const handleBatchArchive = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Simpan/arsipkan ${selectedIds.length} riwayat terpilih secara permanen?`)) return;
    try {
      const res = await api.batchArchiveAuditLogs(selectedIds);
      showToast(res.message || "Riwayat terpilih berhasil diarsipkan", "success");
      setSelectedIds([]);
      fetchLogs(page, perPage, scope);
      loadRetentionStatus();
    } catch (err) {
      showToast(err.message || "Gagal mengarsipkan pilihan", "error");
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(data.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
    <div className="page audit-page">
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            backgroundColor: toast.type === "error" ? "#ef4444" : "#10b981",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: 8,
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)",
            fontWeight: 600,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {toast.type === "error" ? <IconAlert size={18} /> : <IconCheck size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}
      <div className="page-head audit-page-header">
        <div className="audit-title">
          <span className="audit-title-icon"><IconHistory size={21} /></span>
          <div>
            <h2>Aktivitas Sistem</h2>
            <p>Pantau aktivitas akun, simpan riwayat penting, dan pulihkan perubahan.</p>
            <p style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 4 }}>Log yang tidak disimpan akan dihapus otomatis setelah 3 hari.</p>
          </div>
        </div>
        <div className="audit-header-actions">
          <button
            className="btn btn-outline btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowGuide(!showGuide)}
          >
            <IconHistory size={14} />
            {showGuide ? "Tutup Panduan" : "Panduan & Cara Kerja"}
          </button>
          <button className="btn btn-outline audit-refresh" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
            <IconRotate size={14} />
            Muat ulang
          </button>
        </div>
      </div>
      {saveError && (
        <div role="alert" style={{ color: "#b91c1c", background: "#fef2f2", padding: "10px 14px", borderRadius: 8, marginBottom: 12 }}>
          {saveError}
        </div>
      )}

      {/* Box Penjelasan & Panduan Lengkap (Sesuai Permintaan Penjelasan Halaman) */}
      {showGuide && (
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, rgba(238,242,255,0.85), rgba(240,249,255,0.85))",
            border: "1px solid #c7d2fe",
            marginBottom: 16,
          }}
        >
          <div className="card-body" style={{ fontSize: 13, lineHeight: 1.6, color: "#1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: 15, color: "#312e81", display: "flex", alignItems: "center", gap: 8 }}>
                <IconBookmark size={16} /> Penjelasan Fitur Audit Log, Auto-Backup & Restore Data
              </strong>
              <button
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
                onClick={() => setShowGuide(false)}
              >
                <IconX size={16} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              <div style={{ background: "#ffffff", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <strong style={{ color: "#0369a1", display: "block", marginBottom: 4 }}>1. Kebijakan Retensi 72 Jam (3 Hari)</strong>
                <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                  Log aktif disimpan selama <strong>3 hari (72 jam)</strong> sejak tercatat. Sistem memberikan peringatan saat log mendekati batas waktu (24 jam terakhir) sebelum dibersihkan otomatis oleh backend scheduler.
                </p>
              </div>
              <div style={{ background: "#ffffff", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <strong style={{ color: "#047857", display: "block", marginBottom: 4 }}>2. Simpan Riwayat (Pengarsipan)</strong>
                <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                  Gunakan tombol <strong>Simpan Riwayat</strong> pada log penting. Log yang diarsipkan tidak akan pernah terhapus oleh pembersihan otomatis dan tetap tersimpan permanen di tab <em>Riwayat Disimpan</em>.
                </p>
              </div>
              <div style={{ background: "#ffffff", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <strong style={{ color: "#b45309", display: "block", marginBottom: 4 }}>3. Pemulihan Data (Restore / Undo)</strong>
                <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                  Super Admin dapat menekan tombol <strong>Restore</strong> untuk mengembalikan data (Data Barang, Neraca, Spreadsheet Statistik, Kategori) ke kondisi sebelum aksi dilakukan, lengkap dengan pratinjau 3 kolom dan deteksi konflik.
                </p>
              </div>
              <div style={{ background: "#ffffff", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <strong style={{ color: "#4338ca", display: "block", marginBottom: 4 }}>4. Perlindungan Snapshot Terpisah</strong>
                <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                  Data cadangan pemulihan disimpan di tabel khusus (<code>audit_restore_snapshots</code>). Pembersihan tampilan log aktif 72 jam <strong>tidak akan menghapus</strong> cadangan data pemulihan.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner Peringatan Retensi 24 Jam */}
      {retentionStatus.expiring_soon > 0 && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "12px 18px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#92400e" }}>
            <span style={{ color: "#d97706" }}><IconAlert size={20} /></span>
            <span style={{ fontSize: 13 }}>
              <strong>Peringatan Retensi:</strong> Terdapat <strong>{retentionStatus.expiring_soon} riwayat aktivitas</strong> yang akan kedaluwarsa dalam 24 jam ke depan (batas retensi 72 jam). Simpan riwayat penting agar tidak terhapus otomatis.
            </span>
          </div>
          <button
            className="btn btn-sm"
            style={{ backgroundColor: "#d97706", color: "#ffffff", borderColor: "#b45309", fontWeight: 600 }}
            onClick={handleArchiveExpiring}
          >
            <IconBookmark size={13} style={{ marginRight: 4 }} /> Simpan Semua yang Akan Kedaluwarsa
          </button>
        </div>
      )}

      <div className="card">
        {/* Tab Switcher Scope Riwayat */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-color, #e2e8f0)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginRight: 6 }}>Tampilan:</span>
          <button
            className={`btn btn-sm ${scope === "active" ? "btn-primary" : "btn-outline"}`}
            onClick={() => { setScope("active"); setPage(1); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <IconHistory size={13} /> Riwayat Aktif (72 Jam)
            <span style={{ background: scope === "active" ? "rgba(255,255,255,0.25)" : "#e2e8f0", padding: "1px 6px", borderRadius: 999, fontSize: 11 }}>
              {retentionStatus.total_active}
            </span>
          </button>
          <button
            className={`btn btn-sm ${scope === "archived" ? "btn-primary" : "btn-outline"}`}
            onClick={() => { setScope("archived"); setPage(1); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <IconBookmark size={13} /> Riwayat Tersimpan / Arsip
            <span style={{ background: scope === "archived" ? "rgba(255,255,255,0.25)" : "#e2e8f0", padding: "1px 6px", borderRadius: 999, fontSize: 11 }}>
              {retentionStatus.total_archived}
            </span>
          </button>
          <button
            className={`btn btn-sm ${scope === "all" ? "btn-primary" : "btn-outline"}`}
            onClick={() => { setScope("all"); setPage(1); }}
          >
            Semua Riwayat
          </button>

          {/* Batch Actions Toolbar jika ada yang diceklis */}
          {selectedIds.length > 0 && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0369a1" }}>
                {selectedIds.length} riwayat dipilih
              </span>
              <button className="btn btn-sm btn-primary" onClick={handleBatchArchive}>
                <IconArchive size={13} style={{ marginRight: 4 }} /> Simpan Terpilih
              </button>
            </div>
          )}
        </div>

        {/* Filter Toolbar */}
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

        {/* Info Paginasi & Total Baris */}
        <div className="toolbar" style={{ padding: "0 18px 4px" }}>
          <span className="pagination-info" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IconHistory size={14} /> {total.toLocaleString("id-ID")} entri tercatat
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={toggleAllGroups}
              disabled={!logGroups.length}
            >
              {allGroupsExpanded ? "Tutup semua akun" : "Buka semua akun"}
            </button>
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

        {/* Tabel Data Audit Log */}
        <div className="table-wrap audit-table-wrap">
          <table className="table audit-log-table">
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={data.length > 0 && selectedIds.length === data.length}
                    onChange={toggleSelectAll}
                    title="Pilih semua baris"
                  />
                </th>
                <th>Waktu & Masa Retensi</th>
                <th>Pengguna</th>
                <th>Aktivitas</th>
                <th>Modul</th>
                <th>Deskripsi</th>
                <th>IP</th>
                <th>Status Pemulihan</th>
                <th style={{ width: 280, textAlign: "right" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">Memuat data log...</div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <div className="big"><IconHistory size={42} /></div>
                      Tidak ada log yang cocok
                    </div>
                  </td>
                </tr>
              ) : (
                logGroups.map((group) => (
                  <React.Fragment key={group.key}>
                    <tr className="audit-group-header">
                      <td colSpan={9}>
                        <div className="audit-group-content">
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.key)}
                            aria-expanded={expandedGroups.has(group.key)}
                            className="audit-account-toggle"
                          >
                            <span className="audit-chevron"><IconArrowDown size={15} /></span>
                            <span className="audit-avatar">{userInitials(group.name)}</span>
                            <span className="audit-account-name">
                              <strong>{group.name}</strong>
                              <span>{roleLabel(group.role)}</span>
                            </span>
                            <span className="audit-account-count">{group.logs.length} log di halaman ini</span>
                          </button>
                          {group.userId && String(userId) !== String(group.userId) && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm audit-account-filter"
                              onClick={() => { setUserId(String(group.userId)); setPage(1); }}
                              title="Tampilkan seluruh log yang cocok dengan filter untuk akun ini"
                            >
                              Semua log akun ini
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedGroups.has(group.key) && group.logs.map((r) => {
                  const isChecked = selectedIds.includes(r.id);
                  const warning = expiryWarning(r, clockNow);
                  return (
                    <tr key={r.id} className={`audit-log-row${isChecked ? " is-selected" : ""}`}>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(r.id)}
                        />
                      </td>
                      <td className="text-nowrap">
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span>{fmtFull(r.created_at)}</span>
                          {r.is_archived ? (
                            <span style={{ fontSize: 10, color: "#047857", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <IconBookmark size={11} /> Tersimpan Permanen
                            </span>
                          ) : Boolean(Number(r.is_saved)) ? (
                            <span style={{ fontSize: 10, color: "#047857", fontWeight: 600 }}>Disimpan</span>
                          ) : warning ? (
                            <span style={{ fontSize: 10, color: warning.urgent ? "#b91c1c" : "#b45309", fontWeight: 700 }}>{warning.text}</span>
                          ) : null}
                        </div>
                      </td>
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
                      <td style={{ maxWidth: 360 }}>{r.description || "-"}</td>
                      <td className="text-nowrap" style={{ color: "var(--ink-3)", fontSize: 12 }}>{r.ip_address || "-"}</td>
                      <td>
                        {r.is_restored ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "#fdf4ff",
                              color: "#86198f",
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            <IconRotate size={11} /> Telah Dipulihkan
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-3)", fontSize: 11 }}>–</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => toggleSaved(r)}
                            disabled={savingIds.includes(r.id) || deletingIds.includes(r.id)}
                            aria-label={Boolean(Number(r.is_saved)) ? "Lepas simpan log" : "Tandai log"}
                          >
                            {Boolean(Number(r.is_saved)) ? "Ditandai" : "Tandai"}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => deleteLog(r)}
                            disabled={savingIds.includes(r.id) || deletingIds.includes(r.id)}
                            aria-label="Hapus log"
                          >
                            Hapus
                          </button>
                          {/* Tombol Detail Diff */}
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => openDetail(r)}
                            title="Lihat detail & riwayat perubahan"
                          >
                            Detail
                          </button>

                          {/* Tombol Restore / Undo */}
                          {r.can_restore && (
                            <button
                              className="btn btn-sm"
                              style={{
                                padding: "4px 8px",
                                fontSize: 11,
                                backgroundColor: "#fffbeb",
                                borderColor: "#fde68a",
                                color: "#b45309",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                              onClick={() => openRestoreModal(r)}
                              title="Kembalikan data ke kondisi sebelum aksi ini (Undo/Restore)"
                            >
                              <IconUndo size={11} /> Restore
                            </button>
                          )}

                          {/* Tombol Simpan / Arsip Toggle */}
                          <button
                            className="btn btn-outline btn-sm"
                            style={{
                              padding: "4px 8px",
                              fontSize: 11,
                              color: r.is_archived ? "#047857" : "var(--ink-2)",
                            }}
                            onClick={() => handleToggleArchive(r)}
                            title={r.is_archived ? "Batalkan arsip (kembalikan ke masa 72 jam)" : "Simpan riwayat agar tidak terhapus otomatis"}
                          >
                            <IconBookmark size={12} />
                            {r.is_archived ? "Tersimpan" : "Simpan"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                    })}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginasi */}
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

      {/* MODAL 1: Detail Log Biasa (yang sudah ada sebelumnya) */}
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
            <div>
              <span className="text-muted">Status Retensi</span>
              <strong>
                {detail.is_archived
                  ? "Tersimpan Permanen (Diarsipkan)"
                  : Boolean(Number(detail.is_saved))
                  ? "Ditandai untuk disimpan"
                  : detail.expires_in_hours !== null
                  ? `Aktif (sisa ${detail.expires_in_hours} jam)`
                  : "Aktif"}
              </strong>
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
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "16px 0" }}>Tidak ada perubahan data yang tersimpan.</div>
          )}
        </Modal>
      )}

      {/* MODAL 2: Pratinjau & Konfirmasi Restore Data (Undo) 3 Kolom */}
      {restoreModal && (
        <Modal
          title="Pratinjau & Konfirmasi Pemulihan Data (Restore / Undo)"
          onClose={() => !restoreExecuting && setRestoreModal(null)}
          width="820px"
        >
          {restoreLoading ? (
            <div className="empty-state" style={{ padding: "30px 0" }}>
              <IconRotate size={32} style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ marginTop: 10 }}>Memuat pratinjau kondisi data saat ini...</div>
            </div>
          ) : restorePreview ? (
            <div>
              {/* Ringkasan Objek & Pelaku */}
              <div
                style={{
                  background: "var(--bg-subtle, #f8fafc)",
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color, #e2e8f0)",
                  marginBottom: 16,
                  fontSize: 13,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 10,
                }}
              >
                <div>
                  <span className="text-muted" style={{ display: "block", fontSize: 11 }}>Objek / Target Data</span>
                  <strong>{restorePreview.target_summary || "-"}</strong>
                </div>
                <div>
                  <span className="text-muted" style={{ display: "block", fontSize: 11 }}>Pelaku Aktivitas Sebelumnya</span>
                  <strong>{restorePreview.performed_by}</strong>
                </div>
                <div>
                  <span className="text-muted" style={{ display: "block", fontSize: 11 }}>Waktu Aktivitas Tercatat</span>
                  <strong>{fmtFull(restorePreview.performed_at)}</strong>
                </div>
              </div>

              {/* Peringatan Konflik jika ada */}
              {restorePreview.has_conflict && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    padding: "12px 16px",
                    color: "#991b1b",
                    marginBottom: 16,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <IconAlert size={20} style={{ flexShrink: 0, marginTop: 2, color: "#dc2626" }} />
                  <div>
                    <strong>Peringatan Konflik Data Terdeteksi!</strong>
                    <div style={{ marginTop: 2, fontSize: 12 }}>
                      {restorePreview.conflict_reason || "Data di database saat ini telah diubah oleh aktivitas lain setelah log ini dicatat. Memulihkan log ini akan menimpa perubahan tersebut dengan nilai sebelumnya."}
                    </div>
                  </div>
                </div>
              )}

              {/* Tabel Perbandingan 3 Kolom Sesuai Spesifikasi Dokumen */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", display: "block", marginBottom: 6 }}>
                  Perbandingan Nilai (3 Kolom):
                </span>
                <div className="diff-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        <th style={{ width: 180 }}>Field / Atribut</th>
                        <th style={{ background: "#f8fafc" }}>Nilai Saat Ini di Database</th>
                        <th style={{ background: "#ecfdf5", color: "#047857" }}>Nilai Setelah Dipulihkan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restorePreview.diff.map((r, i) => {
                        const isChanged = r.changed;
                        const isConflict = r.conflict;
                        return (
                          <tr
                            key={i}
                            style={{
                              backgroundColor: isConflict ? "rgba(254, 242, 242, 0.6)" : isChanged ? "rgba(240, 253, 244, 0.4)" : undefined,
                            }}
                          >
                            <td style={{ fontWeight: 600 }}>
                              {r.field}
                              {isConflict && (
                                <span style={{ marginLeft: 6, fontSize: 10, color: "#dc2626", fontWeight: 700 }}>
                                  (Konflik)
                                </span>
                              )}
                            </td>
                            <td style={{ color: isConflict ? "#dc2626" : "var(--ink-2)" }}>
                              {fmtVal(r.current)}
                            </td>
                            <td style={{ color: "#047857", fontWeight: isChanged ? 700 : 400 }}>
                              {fmtVal(r.restore)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tombol Konfirmasi */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button
                  className="btn btn-outline"
                  onClick={() => setRestoreModal(null)}
                  disabled={restoreExecuting}
                >
                  Batal
                </button>
                <button
                  className="btn btn-primary"
                  style={{
                    backgroundColor: restorePreview.has_conflict ? "#dc2626" : "#059669",
                    borderColor: restorePreview.has_conflict ? "#b91c1c" : "#047857",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={confirmRestore}
                  disabled={restoreExecuting || !restorePreview.can_restore}
                >
                  {restoreExecuting ? (
                    <>
                      <IconRotate size={14} style={{ animation: "spin 1s linear infinite" }} />
                      Sedang Memulihkan...
                    </>
                  ) : (
                    <>
                      <IconUndo size={14} />
                      {restorePreview.has_conflict ? "Tetap Pulihkan (Timpa Konflik)" : "Konfirmasi & Jalankan Restore"}
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">Data pratinjau tidak tersedia.</div>
          )}
        </Modal>
      )}
    </div>
  );
}