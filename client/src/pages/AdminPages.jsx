import React from "react";
import { api, formatNumber, formatTanggal } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { roleLabel } from "../auth.js";
import ExcelGrid from "../components/ExcelGrid.jsx";
import { loadFiles } from "../excelStorage.js";
import { workbookToSheetsProgressive, detectSheetLayout } from "../excelImportUtil.js";
import { colName, evaluateGrid, createExternalResolverHook } from "../spreadsheet.js";
import Dropdown from "../components/Dropdown.jsx";

const ROLE_BADGE = {
  user: { background: "#eef2ff", color: "#4338ca" },
  admin: { background: "#ecfdf5", color: "#047857" },
  super_admin: { background: "#fef3c7", color: "#b45309" },
};

const AVATAR_BG = {
  user: { background: "#e0e7ff", color: "#4338ca" },
  admin: { background: "#d1fae5", color: "#047857" },
  super_admin: { background: "#fde68a", color: "#b45309" },
};

function initials(nama) {
  const parts = String(nama || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const ROLE_INFO = {
  user: {
    ring: "#eef2ff",
    text: "#4338ca",
    desc: "Hanya bisa melihat data. Tidak dapat menambah, mengubah, atau menghapus data.",
  },
  admin: {
    ring: "#ecfdf5",
    text: "#047857",
    desc: "Bisa menambah & mengubah data, tetapi hanya pada tabel yang ditugaskan kepadanya.",
  },
  super_admin: {
    ring: "#fef3c7",
    text: "#b45309",
    desc: "Akses penuh ke seluruh sistem, termasuk mengelola semua tabel dan seluruh akun pengguna.",
  },
};

function RoleBadge({ role }) {
  const s = ROLE_BADGE[role] || ROLE_BADGE.user;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: s.background,
        color: s.color,
      }}
    >
      {roleLabel(role)}
    </span>
  );
}

function ConfirmDialog({ title, message, onCancel, onConfirm, danger, loading = false, confirmLabel = "Ya, Lanjutkan", cancelLabel = "Batal" }) {
  return (
    <div className="modal-backdrop" style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 2000 }} onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420, width: "100%", margin: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={loading}>{loading ? "Memproses..." : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <input
      type="checkbox"
      checked={!!value}
      onChange={(e) => onChange(e.target.checked)}
      style={{ width: 18, height: 18, cursor: "pointer" }}
    />
  );
}

// Kontrol zoom tampilan untuk pratinjau Penugasan. Hanya mengubah skala visual
// (diteruskan ke prop `zoom` ExcelGrid) — tidak menyentuh data/workbook asli.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

// Pratinjau memakai SATU ExcelGrid aktif saja (bukan semua sheet sekaligus).
// Dibungkus React.memo + prop stabil (konstanta di bawah) agar perubahan state
// lain di halaman (pilih admin, aturan, dsb.) TIDAK memicu render ulang grid.
const PreviewGrid = React.memo(ExcelGrid);
const PV_NOOP = () => {};
const EMPTY_ARR = [];
const EMPTY_MAP = new Map();

function ZoomBar({ zoom, onOut, onIn, onReset }) {
  const pct = Math.round(zoom * 100);
  return (
    <div className="psg-zoom" role="group" aria-label="Kontrol zoom tampilan tabel">
      <span className="psg-zoom-cap">Zoom</span>
      <button type="button" className="psg-zoom-btn" onClick={onOut} disabled={pct <= 50} title="Perkecil" aria-label="Perkecil">−</button>
      <span className="psg-zoom-val" title="Tingkat zoom saat ini">{pct}%</span>
      <button type="button" className="psg-zoom-btn" onClick={onIn} disabled={pct >= 200} title="Perbesar" aria-label="Perbesar">+</button>
      <button type="button" className="psg-zoom-reset" onClick={onReset} disabled={pct === 100} title="Kembalikan ke 100%">Reset</button>
    </div>
  );
}

// Area scroll pratinjau dengan pinch-to-zoom (Ctrl + roda / gesture pinch
// touchpad). Scroll dua jari biasa (tanpa Ctrl) tetap menjadi scroll tabel.
// Hanya memanggil onPinch(factor) untuk mengubah skala tampilan — tidak pernah
// menyentuh data, rumus, sheet, merge, maupun workbook.
function PreviewScroll({ onPinch, children }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      // ctrlKey=false → biarkan browser menggulir seperti biasa.
      if (!e.ctrlKey) return;
      // Sudah ditangani ExcelGrid (pinch tepat di atas grid) → jangan dobel.
      if (e.defaultPrevented) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      onPinch(Math.exp(-e.deltaY * unit * 0.002));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onPinch]);
  return <div className="psg-preview-scroll" ref={ref}>{children}</div>;
}

const EYE_ON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

const EYE_OFF = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
    <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const KEY_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="12" r="3.6" />
    <path d="M11.6 12H20M17.5 12v3M14.5 12v2" />
  </svg>
);

const COPY_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </svg>
);

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </svg>
);

function PasswordField({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="password-field">
      <input
        className="form-control"
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-eye"
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        title={show ? "Sembunyikan" : "Tampilkan"}
        onClick={() => setShow((s) => !s)}
      >
        {show ? EYE_OFF : EYE_ON}
      </button>
    </div>
  );
}

function PasswordCell({ value }) {
  const toast = useToast();
  const [show, setShow] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch (_) {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (_) {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast("Password disalin ke clipboard");
    } else {
      setShow(true);
      toast("Browser menolak salin otomatis — password ditampilkan, salin manual dengan Ctrl+C", "error");
    }
  };

  if (!value) {
    return (
      <span
        className="pw-chip pw-chip-empty"
        title="Password belum terekam: set lewat tombol Password agar tampil di sini."
      >
        belum ada
      </span>
    );
  }
  return (
    <span className={"pw-chip" + (show ? " is-shown" : "")}>
      <span className="pw-chip-icon" aria-hidden="true">{KEY_ICON}</span>
      <code className="pw-chip-text">{show ? value : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}</code>
      <button
        type="button"
        className={"pw-chip-btn" + (copied ? " is-copied" : "")}
        aria-label="Salin password"
        title="Salin password"
        onClick={copy}
      >
        {copied ? CHECK_ICON : COPY_ICON}
      </button>
      <button
        type="button"
        className="pw-chip-btn pw-chip-eye"
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        title={show ? "Sembunyikan password" : "Tampilkan password"}
        onClick={() => setShow((s) => !s)}
      >
        {show ? EYE_OFF : EYE_ON}
      </button>
    </span>
  );
}

// ====== 1. Manajemen User & Admin ======

export function AdminUsers({ user: currentUser }) {
  const toast = useToast();
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(null); // null = mode tambah
  const [form, setForm] = React.useState({ nama: "", email: "", password: "", role: "user" });
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [roleTarget, setRoleTarget] = React.useState(null); // { u, role } untuk konfirmasi perubahan Super Admin
  const [pwTarget, setPwTarget] = React.useState(null); // user yang sedang diset password-nya
  const [pwValue, setPwValue] = React.useState("");
  const [pwSaving, setPwSaving] = React.useState(false);
  const [roleDraft, setRoleDraft] = React.useState(null); // { next } menunggu konfirmasi role di form

  const fetchAll = React.useCallback(async () => {
    try {
      setUsers(await api.getAdminUsers());
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const startEdit = (u) => {
    setEditing(u);
    setForm({ nama: u.nama, email: u.email, password: "", role: u.role });
  };

  const startCreate = () => {
    setEditing(null);
    setForm({ nama: "", email: "", password: "", role: "user" });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const body = { nama: form.nama, email: form.email, role: form.role };
        if (form.password) body.password = form.password;
        await api.updateAdminUser(editing.id, body);
        toast("Pengguna berhasil diperbarui");
      } else {
        await api.createAdminUser(form);
        toast("Pengguna berhasil dibuat");
      }
      setEditing(null);
      await fetchAll();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.deleteAdminUser(deleteTarget.id);
      toast("Pengguna berhasil dihapus");
      setDeleteTarget(null);
      await fetchAll();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const isSelf = (u) => currentUser && u.id === currentUser.id;

  const quickRole = async (u, role) => {
    try {
      await api.updateAdminUser(u.id, { role });
      toast(`${u.nama} kini berperan ${roleLabel(role)}`);
      await fetchAll();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  // Perubahan yang menyangkut Super Admin (naik/turun) butuh konfirmasi.
  const requestRoleChange = (u, role) => {
    if (role === "super_admin" || u.role === "super_admin") {
      setRoleTarget({ u, role });
    } else {
      quickRole(u, role);
    }
  };

  const openSetPassword = (u) => {
    setPwTarget(u);
    setPwValue("");
  };

  // Memilih role di form harus dikonfirmasi dulu (Ya / Tidak).
  const requestFormRole = (next) => {
    if (next === form.role) return;
    setRoleDraft({ next });
  };

  const confirmFormRole = () => {
    setForm((f) => ({ ...f, role: roleDraft.next }));
    setRoleDraft(null);
  };

  const submitSetPassword = async () => {
    if (!pwTarget) return;
    if (!pwValue || pwValue.length < 6) {
      toast("Password minimal 6 karakter", "error");
      return;
    }
    setPwSaving(true);
    try {
      await api.updateAdminUser(pwTarget.id, { password: pwValue });
      toast(`Password ${pwTarget.nama} diset & kini ditampilkan`);
      setPwTarget(null);
      await fetchAll();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <h2>User &amp; Admin Management</h2>
        <p>Atur akun pengguna, admin, dan super admin beserta hak aksesnya.</p>
      </div>

      <div className="info-callout">
        <span className="info-callout-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-5M12 8h.01" />
          </svg>
        </span>
        <p>
          Kolom <b>Password</b> menampilkan password tiap akun — klik ikon mata untuk melihat. Akun yang bertanda
          <i> belum ada</i> dibuat sebelum fitur ini, sehingga passwordnya hanya tersimpan sebagai hash satu arah;
          set password lewat tombol <b>Password</b> atau passwordnya akan terekam otomatis saat akun tersebut login.
        </p>
      </div>

      <div className={"card user-form" + (editing ? " is-editing" : "")}>
        <div className="user-form-head">
          <span className="user-form-icon" aria-hidden="true">
            {editing ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20Z" />
                <path d="M14.5 6.5 17.5 9.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9.5" cy="8" r="3.5" />
                <path d="M3.5 20a6 6 0 0 1 12 0" />
                <path d="M18.5 7.5v5M16 10h5" />
              </svg>
            )}
          </span>
          <div className="user-form-title">
            <h3>{editing ? "Ubah Pengguna" : "Tambah Pengguna Baru"}</h3>
            <p>
              {editing
                ? `Mengubah akun ${editing.nama} (${editing.email}).`
                : "Isi data akun berikut, tentukan role-nya, lalu klik Tambah Pengguna."}
            </p>
          </div>
          {editing && <span className="user-form-mode">Mode Ubah</span>}
        </div>

        <form onSubmit={submit} className="user-form-body">
          <div className="user-form-grid">
            <div className="form-group">
              <label>Nama Lengkap</label>
              <input className="form-control" value={form.nama} onChange={set("nama")} placeholder="Contoh: Budi Santoso" required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input className="form-control" type="email" value={form.email} onChange={set("email")} placeholder="nama@email.com" required />
            </div>
            <div className="form-group">
              <label>
                Password
                {editing && <span className="label-hint">kosongkan bila tetap</span>}
              </label>
              <PasswordField
                value={form.password}
                onChange={set("password")}
                placeholder={editing ? "••••••••" : "Minimal 6 karakter"}
              />
            </div>
            <div className="form-group">
              <label>Role</label>
              <Dropdown
                value={form.role}
                onChange={requestFormRole}
                options={[
                  { value: "user", label: "User (lihat saja)" },
                  { value: "admin", label: "Admin (entry sesuai tugas)" },
                  { value: "super_admin", label: "Super Admin (penuh)" },
                ]}
              />
              <p
                className="role-hint"
                style={{ background: ROLE_INFO[form.role].ring, color: ROLE_INFO[form.role].text }}
              >
                {ROLE_INFO[form.role].desc}
              </p>
            </div>
          </div>

          <div className="user-form-actions">
            {editing ? (
              <>
                <span className="user-form-note">Password hanya berubah bila kolom di atas diisi.</span>
                <button className="btn" type="button" onClick={startCreate}>Batal</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </>
            ) : (
              <>
                <span className="user-form-note">Minimal 6 karakter untuk password.</span>
                <button className="btn" type="button" onClick={startCreate}>Kosongkan</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Menyimpan..." : "Tambah Pengguna"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="table-wrap users-table-wrap">
          <table className="table users-table">
            <thead>
              <tr>
                <th className="th-id">ID</th>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>
                  <span className="th-with-icon">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="10.5" width="16" height="10" rx="2" />
                      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                    </svg>
                    Password
                  </span>
                </th>
                <th className="th-center">Tabel Ditugaskan</th>
                <th>Bergabung</th>
                <th className="th-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={isSelf(u) ? "row-active" : ""}>
                  <td><span className="chip chip-id">{u.id}</span></td>
                  <td>
                    <div className="cell-user">
                      <span className="cell-avatar" data-role={u.role}>{initials(u.nama)}</span>
                      <span className="cell-user-text">
                        <span className="cell-user-name">{u.nama}</span>
                        {isSelf(u) && <span className="cell-user-tag">Anda</span>}
                      </span>
                    </div>
                  </td>
                  <td className="text-muted">{u.email}</td>
                  <td><RoleBadge role={u.role} /></td>
                  <td><PasswordCell value={u.password_plain} /></td>
                  <td className="th-center">
                    <span className={"chip " + ((u.jumlah_tugas || 0) > 0 ? "chip-tugas" : "chip-tugas is-zero")}>
                      {u.jumlah_tugas || 0} tabel
                    </span>
                  </td>
                  <td className="text-muted">{formatTanggal(u.created_at)}</td>
                  <td className="td-actions">
                    {!isSelf(u) && u.role === "user" && (
                      <span className="act-group">
                        <button
                          className="btn btn-sm act act-role"
                          title="Jadikan pengguna ini sebagai Admin (bisa menginput & mengedit data di tabel yang ditugaskan)"
                          onClick={() => quickRole(u, "admin")}
                        >
                          &rarr; Admin
                        </button>
                        <button
                          className="btn btn-sm act act-role act-role-strong"
                          title="Jadikan sebagai Super Admin (akses penuh ke seluruh sistem)"
                          onClick={() => requestRoleChange(u, "super_admin")}
                        >
                          &rarr; Super Admin
                        </button>
                      </span>
                    )}
                    {!isSelf(u) && u.role === "admin" && (
                      <span className="act-group">
                        <button
                          className="btn btn-sm act act-role"
                          title="Turunkan kembali menjadi User biasa (hanya bisa melihat)"
                          onClick={() => quickRole(u, "user")}
                        >
                          &rarr; User
                        </button>
                        <button
                          className="btn btn-sm act act-role act-role-strong"
                          title="Jadikan sebagai Super Admin (akses penuh ke seluruh sistem)"
                          onClick={() => requestRoleChange(u, "super_admin")}
                        >
                          &rarr; Super Admin
                        </button>
                      </span>
                    )}
                    {!isSelf(u) && u.role === "super_admin" && (
                      <span className="act-group">
                        <button
                          className="btn btn-sm act act-role act-role-strong"
                          title="Turunkan menjadi Admin (entry sesuai tugas)"
                          onClick={() => requestRoleChange(u, "admin")}
                        >
                          &rarr; Admin
                        </button>
                        <button
                          className="btn btn-sm act act-role"
                          title="Turunkan menjadi User biasa (hanya bisa melihat)"
                          onClick={() => requestRoleChange(u, "user")}
                        >
                          &rarr; User
                        </button>
                      </span>
                    )}
                    <span className="act-group">
                      <button
                        className="btn btn-sm act act-pw"
                        title="Set password baru untuk akun ini (langsung tampil di kolom Password)"
                        disabled={isSelf(u)}
                        onClick={() => openSetPassword(u)}
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="4" y="10.5" width="16" height="10" rx="2" />
                          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                        </svg>
                        Password
                      </button>
                      <button
                        className="btn btn-sm act"
                        title="Ubah data akun ini"
                        disabled={isSelf(u)}
                        onClick={() => startEdit(u)}
                      >
                        Ubah
                      </button>
                      <button
                        className="btn btn-sm act act-danger"
                        title="Hapus akun ini"
                        disabled={isSelf(u)}
                        onClick={() => setDeleteTarget(u)}
                      >
                        Hapus
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr><td colSpan="8"><div className="empty-state">Belum ada pengguna</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {roleDraft && (
        <ConfirmDialog
          title="Konfirmasi Pilihan Role"
          message={`Jadikan ${editing ? `akun "${editing.nama}"` : "akun baru ini"} sebagai ${roleLabel(roleDraft.next)}? ${ROLE_INFO[roleDraft.next].desc}`}
          danger={roleDraft.next !== "super_admin"}
          confirmLabel="Ya, Gunakan Role Ini"
          cancelLabel="Tidak"
          onCancel={() => setRoleDraft(null)}
          onConfirm={confirmFormRole}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Hapus Pengguna"
          message={`Hapus akun "${deleteTarget.nama}" (${deleteTarget.email})? Data yang sudah tersimpan tidak ikut dihapus.`}
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {roleTarget && (
        <ConfirmDialog
          title={roleTarget.role === "super_admin" ? "Jadikan Super Admin" : "Turunkan dari Super Admin"}
          message={
            roleTarget.role === "super_admin"
              ? `Beri akses penuh Super Admin kepada "${roleTarget.u.nama}" (${roleTarget.u.email})? Akun ini akan bisa mengelola seluruh sistem.`
              : `Turunkan "${roleTarget.u.nama}" (${roleTarget.u.email}) menjadi ${roleLabel(roleTarget.role)}? Akses penuh Super Admin akan dicabut.`
          }
          danger={roleTarget.role !== "super_admin"}
          onCancel={() => setRoleTarget(null)}
          onConfirm={() => {
            const { u, role } = roleTarget;
            setRoleTarget(null);
            quickRole(u, role);
          }}
        />
      )}

      {pwTarget && (
        <div
          className="modal-backdrop"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 2000 }}
          onClick={() => setPwTarget(null)}
        >
          <div className="modal" style={{ maxWidth: 420, width: "100%", margin: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Set Password - {pwTarget.nama}</h3>
              <button className="modal-close" onClick={() => setPwTarget(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)" }}>
                Password lama akun ini tidak dapat ditampilkan (tersimpan sebagai hash satu arah).
                Isi password baru &mdash; setelah disimpan akan terlihat di kolom Password dan bisa
                diubah kapan saja.
              </p>
              <PasswordField
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
                placeholder="Minimal 6 karakter"
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPwTarget(null)} disabled={pwSaving}>Batal</button>
              <button className="btn btn-primary" onClick={submitSetPassword} disabled={pwSaving}>
                {pwSaving ? "Menyimpan..." : "Set & Tampilkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ====== 2. Penugasan Tabel untuk Admin ======

const STANDARD_COLUMNS = [
  { key: "kode", label: "Kode" },
  { key: "nama", label: "Nama" },
  { key: "kategori_id", label: "Kategori" },
  { key: "jumlah", label: "Jumlah" },
  { key: "harga", label: "Harga" },
  { key: "tanggal", label: "Tanggal" },
  { key: "status", label: "Status" },
  { key: "keterangan", label: "Keterangan" },
];

function parseKolom(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch {} }
  return null;
}

function colLetterIndex(alpha) {
  let n = 0;
  for (const ch of String(alpha || "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function xlCol(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const baseNameOf = (name) => String(name || "").replace(/\.(xlsx?|xlsm)$/i, "");

// Label sheet dari baris spreadsheet: publish file multi-sheet memakai nama
// "<sumber_file>@<SheetName>"; baris tanpa "@" (single sheet / legacy) = nama.
const sheetLabelOfRow = (nama) => {
  const t = String(nama || "");
  const at = t.lastIndexOf("@");
  return at >= 0 ? t.slice(at + 1) : t;
};

// Dipakai HANYA pada fallback tanpa workbook lokal: buang suffix hasil looping
// lama ("READ ME (2)" -> "READ ME") agar duplikat hasil publish berulang tidak
// tampil. Bukan sumber data — hanya pembersih label untuk baris lama.
const cleanSheetDupName = (label) => String(label).replace(/\s*\(\d+\)\s*$/, "");

// Daftar Sheet = worksheet ASLI dari workbook browser sebagai single source of
// truth: setiap worksheet muncul SATU KALI dengan nama persis seperti Excel.
// id = baris spreadsheet (target penugasan; baris asli, bukan hasil looping).
// Tanpa workbook lokal -> fallback dari baris DB yang dinormalisasi.
function sheetOptionsFor(fileId, fileGroups, files, spreadsheets) {
  if (!fileId) {
    return spreadsheets.map((r) => ({
      id: String(r.id),
      label: r.hidden ? `${sheetLabelOfRow(r.nama)} (tersembunyi)` : sheetLabelOfRow(r.nama),
      value: String(r.id),
      disabled: false,
    }));
  }
  const rows = fileGroups[fileId] || [];
  if (!rows.length) return [];
  const stem = rows[0].sumber_file ? String(rows[0].sumber_file) : sheetLabelOfRow(rows[0].nama);
  const cands = Array.from(new Set([stem, baseNameOf(stem)])).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  const wbFile = files.find((x) => {
    const fn = String(x.fileName || "").trim();
    if (!fn) return false;
    return cands.includes(baseNameOf(fn).trim().toLowerCase()) || cands.includes(fn.toLowerCase());
  }) || null;
  if (wbFile && wbFile.workbook) {
    const st = baseNameOf(wbFile.fileName || "");
    const sheetNames = (Array.isArray(wbFile.workbook.SheetNames) ? wbFile.workbook.SheetNames : (wbFile.sheetNames || []));
    const wbMeta = wbFile.workbook.Workbook && wbFile.workbook.Workbook.Sheets;
    const norm = (s) => String(s || "").trim();
    const keyOf = (r) => norm(String(r.nama));
    const rowByNama = new Map();
    rows.forEach((r) => rowByNama.set(keyOf(r), r));
    const singleRow = rows.find((r) => keyOf(r) === norm(st)) || null;
    return sheetNames.map((name, i) => {
      const nk = norm(`${st}@${name}`);
      let picked = rowByNama.get(nk) || null;
      if (!picked) {
        const lk = norm(name);
        const sameLabel = rows
          .filter((r) => norm(sheetLabelOfRow(r.nama)) === lk && keyOf(r) !== nk)
          .sort((a, b) => a.id - b.id);
        picked = sameLabel[0] || null;
      }
      if (!picked && singleRow && sheetNames.length === 1) picked = singleRow;
      const id = picked ? String(picked.id) : "";
      const label = norm(name);
      const meta = wbMeta && wbMeta[i];
      const wbHidden = !!(meta && (meta.Hidden === 1 || meta.Hidden === 2));
      const isHidden = !!(picked && picked.hidden) || wbHidden;
      return {
        id,
        label: picked ? (isHidden ? `${label} (tersembunyi)` : label) : `${label} (belum dipublikasikan)`,
        value: id,
        disabled: !picked,
      };
    });
  }
  // Fallback (workbook tidak tersimpan di browser ini): dedupe baris DB per
  // label ter-normalisasi, pilih baris asli (id terkecil).
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const base = cleanSheetDupName(sheetLabelOfRow(r.nama));
    if (!base || seen.has(base)) continue;
    seen.add(base);
    out.push({ id: String(r.id), label: r.hidden ? `${base} (tersembunyi)` : base, value: String(r.id), disabled: false });
  }
  return out;
}

// Cari workbook browser (penyimpanan lokal) untuk sebuah kunci File/Workbook
// (sumber_file). Dipakai level "Seluruh File" agar mengenali workbook dari
// pilihan File, bukan bergantung pada satu baris sheet spreadsheet.
function findWorkbookFile(fileId, fileGroups, files) {
  if (!fileId) return null;
  const rows = (fileGroups && fileGroups[fileId]) || [];
  if (!rows.length) return null;
  const stem = rows[0].sumber_file ? String(rows[0].sumber_file) : sheetLabelOfRow(rows[0].nama);
  const cands = Array.from(new Set([stem, baseNameOf(stem)]))
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);
  return files.find((x) => {
    const fn = String(x.fileName || "").trim();
    if (!fn) return false;
    return cands.includes(baseNameOf(fn).trim().toLowerCase()) || cands.includes(fn.toLowerCase());
  }) || null;
}

// Label rentang seperti "D10:T20". Jika tanpa kolom -> "smua kolom".
const rangeStr = (r) => {
  const colArr = Array.isArray(r && r.kolom) ? r.kolom : (Array.isArray(r && r.cols) ? r.cols : null);
  const cols = colArr && colArr.length
    ? [...colArr.map(String)].sort((a, b) => colLetterIndex(a) - colLetterIndex(b))
    : null;
  const cA = cols ? cols[0] : "";
  const cB = cols ? cols[cols.length - 1] : "";
  const a = r.awal != null ? r.awal : "…";
  const b = r.akhir != null ? r.akhir : "…";
  return cols ? `${cA}${a}:${cB}${b}` : `baris ${a}-${b} (smua kolom)`;
};

function columnOptionsFor(sheet) {
  const seen = new Set();
  const out = [];
  const add = (key, label) => {
    const k = String(key || "").trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ key: k, label: String(label || key) });
  };
  STANDARD_COLUMNS.forEach((c) => add(c.key, c.label));
  const cols = parseKolom(sheet && sheet.kolom);
  if (Array.isArray(cols)) cols.forEach((c) => c && c.key && add(c.key, c.label || c.key));
  return out;
}

// Peta kolom pada pratinjau sheet asli (huruf A, B, ...) -> key kolom database
// (sumber enforcemebt admin). Dicocokkan lewat label header sheet; fallback posisi.
function buildKeyOfCol(sh, sheet, headerRowIdx) {
  const kolomArr = parseKolom(sh && sh.kolom) || [];
  const dbKeys = kolomArr.map((c) => String(typeof c === "string" ? c : (c && c.key) || c)).filter(Boolean);
  const labels = kolomArr.map((c) => (typeof c === "string" ? c : ((c && c.label) || (c && c.key) || "")));
  const labelToKey = {};
  for (let i = 0; i < kolomArr.length; i++) {
    const t = String(labels[i] || "").trim().toLowerCase();
    if (t && dbKeys[i]) labelToKey[t] = dbKeys[i];
  }
  const out = {};
  const hr = headerRowIdx != null && sheet && sheet.rows ? sheet.rows[headerRowIdx] : null;
  for (let ci = 0; ci < sheet.columns.length; ci++) {
    const letter = sheet.columns[ci].key;
    const label = hr ? hr[letter] : null;
    const t = label == null ? "" : String(label).trim().toLowerCase();
    out[letter] = (t && labelToKey[t]) || dbKeys[ci] || letter;
  }
  return out;
}

const sectionKeys = (kolom) =>
  Array.isArray(kolom)
    ? kolom.map((c) => String(typeof c === "string" ? c : (c && c.key) || c)).filter(Boolean)
    : [];

function ColumnPicker({ options, value = [], onChange }) {
  const toggle = (key) => {
    const has = value.includes(key);
    onChange(has ? value.filter((k) => k !== key) : [...value, key]);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 130, overflow: "auto", padding: 8, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" }}>
      {options.map((c) => (
        <label key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer", padding: "3px 8px", borderRadius: 6, background: value.includes(c.key) ? "#dbeafe" : "#fff", border: "1px solid #e2e8f0" }}>
          <input type="checkbox" checked={value.includes(c.key)} onChange={() => toggle(c.key)} style={{ width: 15, height: 15 }} />
          {c.label}
        </label>
      ))}
      {options.length === 0 && <span className="text-muted" style={{ fontSize: 13 }}>Tidak ada kolom terdeteksi.</span>}
    </div>
  );
}

export function AdminTables() {
  const toast = useToast();
  const [perms, setPerms] = React.useState([]);
  const [admins, setAdmins] = React.useState([]);
  const [spreadsheets, setSpreadsheets] = React.useState([]);
  const [files, setFiles] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({ userId: "", tabelId: "", fileId: "", locked: false, canEntry: true });
  const [pv, setPv] = React.useState(null);
  const [pvSheets, setPvSheets] = React.useState([]);
  const [pvNames, setPvNames] = React.useState([]);
  const [pvActive, setPvActive] = React.useState("");
  const [pvLoading, setPvLoading] = React.useState(false);
  const [pvMsg, setPvMsg] = React.useState("");
  const [gridSel, setGridSel] = React.useState(null);
  const gridSelRef = React.useRef(null);
  const pvSheetsRef = React.useRef([]);
  const pvActiveRef = React.useRef("");
  const pvUserPickedRef = React.useRef(false);
  const pvLoadTokenRef = React.useRef(0);
  const pvCancelRef = React.useRef(null);
  const pvCacheRef = React.useRef(new Map());
  const [scopes, setScopes] = React.useState([]);
  const [scopeLevel, setScopeLevel] = React.useState("selection");
  const [zoom, setZoom] = React.useState(1);
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const fetchAll = React.useCallback(async () => {
    try {
      const [p, users, sp, sc] = await Promise.all([
        api.getAdminPermissions(),
        api.getAdminUsers(),
        api.getSpreadsheet().catch(() => []),
        api.getAdminScopes().catch(() => []),
      ]);
      setPerms(p);
      setScopes(Array.isArray(sc) ? sc : []);
      setAdmins(users.filter((u) => u.role === "admin"));
      setSpreadsheets(sp);
      setFiles(loadFiles());
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  // Workbook -> sheet: satu file (Workbook) dapat memiliki banyak sheet.
  const fileGroups = React.useMemo(() => {
    const groups = {};
    for (const s of spreadsheets) {
      const key = String(s.sumber_file || `#${s.id}`);
      (groups[key] = groups[key] || []).push(s);
    }
    return groups;
  }, [spreadsheets]);
  const fileLabel = (sf, s) => (sf ? `${sf}` : s.nama);
  const fileOptions = Object.entries(fileGroups).map(([key, sheets]) => ({
    key,
    label: fileLabel(sheets[0].sumber_file, sheets[0]),
    sheets,
  }));

  // Pilih file (Workbook) -> otomatis pilih sheet pertama dari file tersebut.
  const onFileChange = (fileId) => {
    const opts = fileId ? sheetOptionsFor(fileId, fileGroups, files, spreadsheets) : [];
    setForm((f) => ({ ...f, fileId, tabelId: opts.length ? opts[0].value : "" }));
  };
  const onSheetChange = (tabelId) => setForm((f) => ({ ...f, tabelId }));

  const toggleFlag = async (perm, key, val) => {
    try {
      const body = { canEntry: perm.can_entry, canEdit: perm.can_edit };
      if (key === "can_entry") body.canEntry = val ? 1 : 0;
      else body.canEdit = val ? 1 : 0;
      await api.updateAdminPermission(perm.id, body);
      setPerms((prev) => prev.map((p) => (p.id === perm.id ? { ...p, [key]: val } : p)));
      toast("Perizinan diperbarui");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async (perm) => {
    try {
      await api.deleteAdminPermission(perm.id);
      setPerms((prev) => prev.filter((p) => p.id !== perm.id));
      toast("Penugasan dihapus");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const scopeLabel = (p) => {
    const parts = [];
    parts.push(p.nama_section ? `Bagian: ${p.nama_section}` : "Seluruh sheet");
    let cols = Array.isArray(p.kolom_izin) ? p.kolom_izin : null;
    if (!cols && p.section_kolom) cols = sectionKeys(p.section_kolom);
    const izin = p.baris_izin || null;
    const rangesArr = izin && Array.isArray(izin.ranges) ? izin.ranges : [];
    const locksArr = izin && Array.isArray(izin.locks) ? izin.locks : [];
    if (rangesArr.length || locksArr.length) {
      const lockTxt = locksArr.length ? ` · lock: ${locksArr.map((r) => rangeStr(r)).join(", ")}` : "";
      if (rangesArr.length) {
        parts.push(`${rangesArr.length} rentang editable` + (locksArr.length ? ` + ${locksArr.length} lock` : ""));
        return parts.join(" · ") + lockTxt;
      }
      return parts.join(" · ") + lockTxt;
    }
    parts.push(cols && cols.length ? `${cols.length} kolom` : "Semua kolom");
    const rowsSet = izin && Array.isArray(izin.rows) && izin.rows.length
      ? izin.rows.map(Number).filter((n) => Number.isInteger(n) && n >= 1)
      : null;
    if (rowsSet) {
      parts.push(`Baris: ${rowsSet.length} posisi`);
    } else {
      const awal = (izin && izin.awal != null) ? izin.awal : (p.baris_awal != null ? p.baris_awal : null);
      const akhir = (izin && izin.akhir != null) ? izin.akhir : (p.baris_akhir != null ? p.baris_akhir : null);
      parts.push(awal != null || akhir != null ? `Baris ${awal ?? "…"}-${akhir ?? "…"}` : "Semua baris");
    }
    return parts.join(" · ");
  };

  // Daftar Sheet = worksheet asli dari Workbook (single source of truth):
  // setiap worksheet muncul sekali, nama persis seperti Excel. target id =
  // baris spreadsheet (baris asli, bukan hasil looping).
  const sheetOptions = React.useMemo(
    () => sheetOptionsFor(form.fileId, fileGroups, files, spreadsheets),
    [form.fileId, fileGroups, files, spreadsheets]
  );

  // ---- Pratinjau sheet ASLI via komponen ExcelGrid & sumber data yang sama
  //      dengan halaman Spreadsheet (workbook dari penyimpanan browser:
  //      posisi, rumus, merges, ukuran kolom/baris, warna, border, gambar).
  //      PAKAI draft edit bila ada (persis ExcelEditor), else workbook asli.
  React.useEffect(() => {
    const tabelId = form.tabelId;
    const wbKey = form.fileId;
    if (!tabelId && !wbKey) {
      setPv(null); setPvSheets([]); setPvNames([]); setPvActive(""); setPvMsg("");
      pvSheetsRef.current = []; pvActiveRef.current = ""; pvUserPickedRef.current = false;
      return;
    }
    const sh = spreadsheets.find((s) => String(s.id) === String(tabelId)) || null;
    let cancelled = false;
    const token = ++pvLoadTokenRef.current;
    if (pvCancelRef.current) { try { pvCancelRef.current(); } catch (_) { /* abaikan */ } pvCancelRef.current = null; }
    setPvLoading(true);
    setPvMsg("");
    setGridSel(null);
    gridSelRef.current = null;
    pvSheetsRef.current = [];
    pvActiveRef.current = "";
    pvUserPickedRef.current = false;
    setPvActive("");

    // Cocokkan spreadsheet -> file workbook yang ada di penyimpanan browser
    // (sama seperti halaman Spreadsheet). sumber_file = label file (tanpa
    // ekstensi untuk hasil publish); fallback pakai nama sheet sebelum "@".
    // Level "Seluruh File" mengenali workbook lewat pilihan File (form.fileId)
    // lebih dulu, agar tidak bergantung pada satu baris sheet.
    let file = findWorkbookFile(wbKey, fileGroups, files);
    if (!file && sh) {
      const candidates = [];
      const add = (s) => { const t = String(s || "").trim(); if (t) candidates.push(t.toLowerCase()); };
      if (sh.sumber_file) {
        add(sh.sumber_file);
        add(sh.sumber_file.replace(/\.[^.]+$/, ""));
      } else {
        const nm = String(sh.nama || "");
        const base = nm.includes("@") ? nm.slice(0, nm.lastIndexOf("@")) : nm;
        add(base);
        add(base.replace(/\.[^.]+$/, ""));
      }
      file = files.find((x) => {
        const fn = String(x.fileName || "").trim();
        if (!fn) return false;
        const fb = baseNameOf(fn).trim().toLowerCase();
        return candidates.includes(fb) || candidates.includes(fn.toLowerCase());
      }) || null;
    }

    if (!file || !file.workbook) {
      setPv(null);
      setPvSheets([]);
      setPvNames([]);
      setPvMsg(
        `File/Workbook "${(sh && (sh.sumber_file || sh.nama)) || wbKey || ""}" tidak ditemukan di penyimpanan browser ini. ` +
        "Buka halaman Spreadsheet terlebih dahulu agar file-nya tersedia di sini, atau import ulang lewat menu Import Excel."
      );
      setPvLoading(false);
      return;
    }

    // Daftar Sheet tampil SEGERA (nama saja) — tidak menunggu isi tabel dibangun.
    const names = Array.isArray(file.workbook.SheetNames) ? file.workbook.SheetNames.slice() : [];
    setPvNames(names);

    const want = sh && String(sh.nama || "").includes("@")
      ? String(sh.nama).slice(String(sh.nama).lastIndexOf("@") + 1).trim()
      : String((sh && sh.nama) || "").trim();
    const pickSheet = (arr) => {
      if (!arr || !arr.length) return null;
      return arr.find((s) => String(s && s.name || "").trim().toLowerCase() === want.toLowerCase())
        || (want && arr.find((s) => String(s && s.name || "").trim().toLowerCase().indexOf(want.toLowerCase()) >= 0))
        || (arr.length === 1 ? arr[0] : null)
        || arr[0] || null;
    };
    // Sheet terpilih (sheet asli) dipakai sebagai sumber `pv` untuk mode
    // satu-sheet & untuk metadata. `pvSheets` (semua sheet yang sudah dibangun)
    // dipakai sebagai konteks rumus lintas-sheet — TIDAK pernah dirender semua.
    const buildPv = (allSheets, nf) => {
      const ws = file.workbook.Sheets[nf.name] || null;
      const layout = ws ? detectSheetLayout(ws) : { dataStart: 0, headerRowIdx: null };
      setPv({
        native: true,
        source: "native",
        fileId: file.id,
        fileName: file.fileName,
        sheetName: nf.name,
        allSheets: allSheets || [],
        rows: nf.rows,
        columns: nf.columns,
        merges: nf.merges || [],
        freezePane: nf.freeze || null,
        images: nf.images || [],
        banner: nf.banner || null,
        formulaCount: nf.__formulaCount || 0,
        dataStart: layout.dataStart || 0,
        headerRowIdx: layout.headerRowIdx,
        keyOfCol: sh ? buildKeyOfCol(sh, nf, layout.headerRowIdx) : null,
      });
    };

    // Terapkan sekumpulan sheet yang sudah dibangun. Sheet aktif mengikuti sheet
    // target (pilihan form) sampai pengguna memilih sheet lain secara manual.
    const applySheets = (allSheets) => {
      if (cancelled || token !== pvLoadTokenRef.current) return;
      pvSheetsRef.current = allSheets;
      setPvSheets(allSheets);
      const nf = pickSheet(allSheets);
      if (!pvUserPickedRef.current && nf && nf.name !== pvActiveRef.current) {
        pvActiveRef.current = nf.name;
        setPvActive(nf.name);
      }
      if (nf && nf.rows && nf.rows.length) buildPv(allSheets, nf);
      setPvLoading(false);
    };

    // Cache sesi: file yang sudah selesai dibangun tidak diimpor ulang saat
    // Super Admin berpindah file bolak-balik.
    const cached = pvCacheRef.current.get(file.id);
    if (cached && cached.done && cached.filesRef === files) {
      applySheets(cached.sheets);
      return () => { cancelled = true; };
    }

    const loadProgressive = () => {
      const onDone = () => {
        if (cancelled || token !== pvLoadTokenRef.current) return;
        pvCacheRef.current.set(file.id, { sheets: pvSheetsRef.current, filesRef: files, done: true });
        applySheets(pvSheetsRef.current);
      };
      pvCancelRef.current = workbookToSheetsProgressive(
        file.workbook,
        { native: true },
        (acc) => applySheets(acc),
        onDone
      );
    };

    loadProgressive();
    return () => { cancelled = true; };
  }, [form.tabelId, form.fileId, spreadsheets, files, fileGroups]);

  // Evaluasi ulang rumus (termasuk antar-sheet & antar-file) seperti Spreadsheet
  // page: semua sheet file dimuat ke context, file lain via resolver eksternal.
  const formulaDensity = React.useMemo(() => {
    if (!pv) return 0;
    if (typeof pv.formulaCount === "number") return pv.formulaCount;
    let n = 0;
    const cols = pv.columns;
    for (const row of pv.rows) {
      for (const c of cols) {
        const v = row[c.key];
        if (typeof v === "string" && v.startsWith("=")) { n++; if (n > 800) return n; }
      }
    }
    return n;
  }, [pv]);

  const allSheetsMap = React.useMemo(() => {
    const m = {};
    for (const s of pvSheets) {
      if (s && s.name) m[s.name.toUpperCase()] = s;
    }
    return m;
  }, [pvSheets]);

  const fileSheets = React.useMemo(() => {
    const m = {};
    if (!pv || !pv.fileName) return m;
    const byName = {};
    for (const s of pvSheets) {
      if (s && s.name) byName[s.name.toUpperCase()] = s;
    }
    for (const k of [String(pv.fileName).toUpperCase(), baseNameOf(String(pv.fileName)).toUpperCase()]) {
      if (k) m[k] = byName;
    }
    return m;
  }, [pv, pvSheets]);

  const externalHook = React.useMemo(() => {
    const byKey = new Map();
    for (const f of files) {
      if (!f || !f.workbook) continue;
      for (const k of [String(f.fileName || "").toUpperCase(), baseNameOf(String(f.fileName)).toUpperCase()]) {
        if (k && !byKey.has(k)) byKey.set(k, f.workbook);
      }
    }
    return createExternalResolverHook ? createExternalResolverHook(byKey) : null;
  }, [files]);

  const computed = React.useMemo(() => {
    if (!pv) return EMPTY_MAP;
    if (formulaDensity === 0) return EMPTY_MAP;
    try {
      return evaluateGrid(pv.rows, pv.columns, allSheetsMap, pv.sheetName.toUpperCase(), {
        fileSheets,
        external: externalHook,
      });
    } catch {
      return EMPTY_MAP;
    }
  }, [pv, formulaDensity, allSheetsMap, fileSheets, externalHook]);

  const onGridSel = React.useCallback((s) => {
    const sig = s ? `${s.r1}|${s.r2}|${s.c1}|${s.c2}` : "";
    if (gridSelRef.current === sig) return;
    gridSelRef.current = sig;
    setGridSel(s);
  }, []);

  const selLabel = () => {
    if (!gridSel) return null;
    const a = `${colName(gridSel.c1)}${gridSel.r1 + 1}`;
    const b = `${colName(gridSel.c2)}${gridSel.r2 + 1}`;
    return a === b ? a : `${a}:${b}`;
  };

  // ===== Aturan cakupan (LOCK/UNLOCK) =====

  const selectedSheet = React.useMemo(
    () => spreadsheets.find((s) => String(s.id) === String(form.tabelId)) || null,
    [spreadsheets, form.tabelId]
  );
  const selectedWorkbookKey = React.useMemo(() => {
    if (form.fileId) return form.fileId;
    if (selectedSheet) return selectedSheet.sumber_file || selectedSheet.nama;
    return "";
  }, [form.fileId, selectedSheet]);
  const selectedSheetName = React.useMemo(() => {
    if (!selectedSheet) return null;
    const n = String(selectedSheet.nama || "");
    return n.includes("@") ? n.slice(n.lastIndexOf("@") + 1) : n;
  }, [selectedSheet]);

  // Peta nama sheet asli -> id baris spreadsheet (target penugasan), untuk
  // memfilter aturan cakupan per sheet pada pratinjau "Seluruh File".
  const sheetIdByName = React.useMemo(() => {
    const m = new Map();
    for (const o of sheetOptions) {
      if (!o.value) continue;
      const label = String(o.label || "").replace(/\s*\((tersembunyi|belum dipublikasikan)\)\s*$/i, "").trim().toLowerCase();
      if (label) m.set(label, String(o.value));
    }
    return m;
  }, [sheetOptions]);

  // Sheet aktif yang dirender — HANYA satu grid pada satu waktu (sheet lain
  // tetap dibangun sebagai konteks rumus, tetapi tidak dirender sama sekali).
  const activeSheet = React.useMemo(() => {
    if (!pvSheets.length) return null;
    if (pvActive) return pvSheets.find((s) => s.name === pvActive) || null;
    return pvSheets[0];
  }, [pvSheets, pvActive]);

  // Rumus dievaluasi HANYA untuk sheet aktif (bukan seluruh workbook) — inilah
  // beban utama yang dulu membuat halaman berat saat "Seluruh File".
  const computedActive = React.useMemo(() => {
    const s = activeSheet;
    if (!s) return EMPTY_MAP;
    let n = typeof s.__formulaCount === "number" ? s.__formulaCount : -1;
    if (n < 0) {
      n = 0;
      outer: for (const row of s.rows) {
        for (const c of s.columns) {
          const v = row[c.key];
          if (typeof v === "string" && v.startsWith("=")) { n++; if (n > 400) break outer; }
        }
      }
    }
    if (!n) return EMPTY_MAP;
    try {
      return evaluateGrid(s.rows, s.columns, allSheetsMap, s.name.toUpperCase(), { fileSheets, external: externalHook });
    } catch {
      return EMPTY_MAP;
    }
  }, [activeSheet, allSheetsMap, fileSheets, externalHook]);

  // Overlay aturan tersimpan untuk satu sheet (workbook-level berlaku ke semua).
  const highlightsForSheet = React.useCallback((sheet) => {
    if (!sheet || !form.userId) return [];
    const wb = String(selectedWorkbookKey || "").trim().toUpperCase();
    const sid = sheetIdByName.get(String(sheet.name || "").trim().toLowerCase());
    const rMax = Math.max(0, sheet.rows.length - 1);
    const cMax = Math.max(0, sheet.columns.length - 1);
    return scopes
      .filter((r) => {
        if (Number(r.admin_id) !== Number(form.userId)) return false;
        if (String(r.workbookKey || "").trim().toUpperCase() !== wb) return false;
        if (r.level === "workbook") return true;
        return sid != null && Number(r.sheetId) === Number(sid);
      })
      .map((r) => {
        if (r.level === "workbook" || r.level === "sheet") {
          return { r1: 0, r2: rMax, c1: 0, c2: cMax, lock: r.status === "lock" };
        }
        if (r.level === "column") {
          const keys = r.colKeys || [];
          const idx = keys.map((k) => colLetterIndex(k)).filter((n) => n != null);
          if (!idx.length) return { r1: 0, r2: rMax, c1: 0, c2: cMax, lock: r.status === "lock" };
          return { r1: 0, r2: rMax, c1: Math.min(...idx), c2: Math.max(...idx), lock: r.status === "lock" };
        }
        return {
          r1: Math.min(r.r1 ?? 0, rMax), r2: Math.min(r.r2 ?? 0, rMax),
          c1: Math.min(r.c1 ?? 0, cMax), c2: Math.min(r.c2 ?? 0, cMax),
          lock: r.status === "lock",
        };
      });
  }, [scopes, form.userId, selectedWorkbookKey, sheetIdByName]);

  // Overlay hanya untuk sheet aktif (tidak menghitung seluruh workbook).
  const highlightsActive = React.useMemo(
    () => (activeSheet ? highlightsForSheet(activeSheet) : EMPTY_ARR),
    [highlightsForSheet, activeSheet]
  );

  const onPickSheet = React.useCallback((name) => {
    pvUserPickedRef.current = true;
    pvActiveRef.current = name;
    setPvActive(name);
    setGridSel(null);
    gridSelRef.current = null;
  }, []);

  const resetScope = () => {
    setScopeLevel("selection");
    setGridSel(null);
    gridSelRef.current = null;
  };

  const onLevelChange = (level) => {
    setScopeLevel(level);
    // Pindah cakupan membatalkan seleksi grid sebelumnya agar tidak salah sasaran.
    setGridSel(null);
    gridSelRef.current = null;
  };

  // Konteks sheet yang sedang dipratinjau: single-sheet (pv) ATAU sheet aktif
  // pada mode Seluruh File. Semua koordinat merujuk sheet ASLI (0-based).
  const scopeCtx = React.useMemo(() => {
    if (pv) {
      return { rows: pv.rows.length, cols: pv.columns.length, sheetId: Number(form.tabelId), sheetName: selectedSheetName };
    }
    if (activeSheet) {
      const sid = sheetIdByName.get(String(activeSheet.name || "").trim().toLowerCase());
      return { rows: activeSheet.rows.length, cols: activeSheet.columns.length, sheetId: sid != null ? Number(sid) : null, sheetName: activeSheet.name };
    }
    return null;
  }, [pv, form.tabelId, selectedSheetName, activeSheet, sheetIdByName]);

  // Level cakupan efektif diturunkan dari pilihan Super Admin + seleksi grid.
  const derivedLevel = () => {
    if (scopeLevel === "workbook") return "workbook";
    if (scopeLevel === "sheet") return "sheet";
    if (!scopeCtx || !gridSel) return null;
    const rMax = Math.max(0, scopeCtx.rows - 1);
    const cMax = Math.max(0, scopeCtx.cols - 1);
    const r1 = Math.min(gridSel.r1, gridSel.r2);
    const r2 = Math.max(gridSel.r1, gridSel.r2);
    const c1 = Math.min(gridSel.c1, gridSel.c2);
    const c2 = Math.max(gridSel.c1, gridSel.c2);
    const fullRows = r1 <= 0 && r2 >= rMax;
    const fullCols = c1 <= 0 && c2 >= cMax;
    if (fullRows && fullCols) return "sheet";
    if (fullCols) return "row";
    if (fullRows) return "column";
    if (r1 === r2 && c1 === c2) return "cell";
    return "range";
  };

  // Zoom pratinjau: hanya skala tampilan, dibatasi 50%–200%.
  const zoomIn = () => setZoom((z) => clampZoom(z + 0.1));
  const zoomOut = () => setZoom((z) => clampZoom(z - 0.1));
  const zoomReset = () => setZoom(1);
  // Pinch touchpad (Ctrl+roda): `factor` >1 = zoom in, <1 = zoom out.
  const onPinch = React.useCallback((factor) => setZoom((z) => clampZoom(z * factor)), []);

  // Bangun body aturan dari pilihan saat ini. Selalu berupa REFERENSI ke sheet
  // ASLI (workbook_key + sheet_id + koordinat) — tidak ada salinan data.
  const scopeTarget = () => {
    const level = derivedLevel();
    if (!level) return null;
    const base = {
      level,
      workbookKey: selectedWorkbookKey,
      workbookName: fileLabel(selectedWorkbookKey, selectedSheet || {}),
      sheetId: null,
      sheetName: null,
    };
    if (level === "workbook") return base;
    if (!scopeCtx || scopeCtx.sheetId == null) return null;
    const sheet = { sheetId: scopeCtx.sheetId, sheetName: scopeCtx.sheetName };
    const rMax = Math.max(0, scopeCtx.rows - 1);
    const cMax = Math.max(0, scopeCtx.cols - 1);
    if (level === "sheet") return { ...base, ...sheet };
    if (level === "column") {
      const c1 = Math.min(gridSel.c1, gridSel.c2);
      const c2 = Math.max(gridSel.c1, gridSel.c2);
      const colKeys = [];
      for (let c = c1; c <= c2; c++) colKeys.push(colName(c));
      return { ...base, ...sheet, colKeys, r1: 0, r2: rMax, c1, c2 };
    }
    if (level === "row") {
      const r1 = Math.min(gridSel.r1, gridSel.r2);
      const r2 = Math.max(gridSel.r1, gridSel.r2);
      return { ...base, ...sheet, r1, r2, c1: 0, c2: cMax };
    }
    const r1 = Math.min(gridSel.r1, gridSel.r2);
    const r2 = Math.max(gridSel.r1, gridSel.r2);
    const c1 = Math.min(gridSel.c1, gridSel.c2);
    const c2 = Math.max(gridSel.c1, gridSel.c2);
    return { ...base, ...sheet, r1, r2, c1, c2 };
  };

  const scopeReady = () => {
    if (!form.userId) return "Pilih Admin terlebih dahulu";
    if (!selectedWorkbookKey) return "Pilih File/Workbook terlebih dahulu";
    if (scopeLevel === "selection" && !scopeCtx) return "Pilih Sheet terlebih dahulu";
    if (scopeLevel === "selection" && !gridSel) return "Pilih cell/baris/kolom di pratinjau dulu";
    if (scopeLevel !== "workbook" && scopeCtx && scopeCtx.sheetId == null) return "Sheet asli tidak ditemukan";
    return null;
  };

  // action: "lock" | "unlock" | "entry" | "noentry" | "save".
  // Lock dan Entry adalah dua dimensi TERPISAH; tombol cepat mengubah satu
  // dimensi lalu menyimpan kombinasi keduanya. Lock hanya berlaku pada AREA
  // yang dipilih, bukan seluruh tabel.
  const applyScope = async (action) => {
    const problem = scopeReady();
    if (problem) { toast(problem, "error"); return; }
    const target = scopeTarget();
    if (!target) { toast("Cakupan tidak valid", "error"); return; }
    const locked = action === "lock" ? true : action === "unlock" ? false : form.locked;
    const canEntry = action === "entry" ? true : action === "noentry" ? false : form.canEntry;
    const body = {
      adminId: Number(form.userId),
      ...target,
      status: locked ? "lock" : "unlock",
      canEntry,
      canEdit: !locked,
    };
    try {
      await api.createAdminScope(body);
      setForm((f) => ({ ...f, locked, canEntry }));
      toast(`Disimpan: ${locked ? "🔒 Lock" : "🔓 Unlock"} · Entry ${canEntry ? "diizinkan" : "dilarang"}`);
      setGridSel(null);
      gridSelRef.current = null;
      await fetchAll();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const toggleScopeStatus = async (rule) => {
    const next = rule.status === "lock" ? "unlock" : "lock";
    try {
      await api.updateAdminScope(rule.id, {
        level: rule.level,
        r1: rule.r1, c1: rule.c1, r2: rule.r2, c2: rule.c2,
        colKeys: rule.colKeys || null,
        status: next,
        canEntry: rule.canEntry !== false,
        canEdit: rule.canEdit !== false,
      });
      setScopes((prev) => prev.map((r) => (r.id === rule.id ? { ...r, status: next } : r)));
      toast(next === "lock" ? "Sel dikunci" : "Sel dibuka");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  // Entry adalah dimensi TERPISAH dari Lock: mengubah izin Entry tidak boleh
  // mengubah status Lock/Unlock.
  const toggleScopeEntry = async (rule) => {
    const next = rule.canEntry !== false ? 0 : 1;
    try {
      await api.updateAdminScope(rule.id, {
        level: rule.level,
        r1: rule.r1, c1: rule.c1, r2: rule.r2, c2: rule.c2,
        colKeys: rule.colKeys || null,
        status: rule.status,
        canEntry: next,
        canEdit: rule.canEdit !== false,
      });
      setScopes((prev) => prev.map((r) => (r.id === rule.id ? { ...r, canEntry: !!next } : r)));
      toast(next ? "Entry diizinkan pada area ini" : "Entry dilarang pada area ini");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const removeScope = async (rule) => {
    try {
      await api.deleteAdminScope(rule.id);
      setScopes((prev) => prev.filter((r) => r.id !== rule.id));
      toast("Aturan dihapus");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const scopeScopeLabel = (r) => {
    if (r.level === "workbook") return "Seluruh workbook";
    if (r.level === "sheet") return `Sheet ${r.sheetName || r.sheetId}`;
    if (r.level === "column") {
      const keys = r.colKeys || [];
      if (!keys.length) return "Semua kolom";
      if (keys.length === 1) return `Kolom ${keys[0]}`;
      return `Kolom ${keys[0]}:${keys[keys.length - 1]}`;
    }
    if (r.level === "row") return `Baris ${(r.r1 ?? 0) + 1}:${(r.r2 ?? 0) + 1}`;
    if (r.level === "cell") return `${colName(r.c1 ?? 0)}${(r.r1 ?? 0) + 1}`;
    return `${colName(r.c1 ?? 0)}${(r.r1 ?? 0) + 1}:${colName(r.c2 ?? 0)}${(r.r2 ?? 0) + 1}`;
  };

  // Aturan milik sheet yang sedang dipakai, untuk overlay di pratinjau.
  const scopeHighlights = React.useMemo(() => {
    if (!pv) return [];
    const wb = String(selectedWorkbookKey || "").trim().toUpperCase();
    const sid = Number(form.tabelId);
    return scopes
      .filter((r) => {
        if (Number(r.admin_id) !== Number(form.userId)) return false;
        if (String(r.workbookKey || "").trim().toUpperCase() !== wb) return false;
        if (r.level === "workbook") return true;
        return Number(r.sheetId) === sid;
      })
      .map((r) => {
        const rMax = pv.rows.length - 1;
        const cMax = Math.max(0, pv.columns.length - 1);
        if (r.level === "workbook" || r.level === "sheet") {
          return { r1: 0, r2: rMax, c1: 0, c2: cMax, lock: r.status === "lock" };
        }
        if (r.level === "column") {
          const keys = r.colKeys || [];
          const idx = keys.map((k) => colLetterIndex(k)).filter((n) => n != null);
          if (!idx.length) return { r1: 0, r2: rMax, c1: 0, c2: cMax, lock: r.status === "lock" };
          return {
            r1: 0, r2: rMax,
            c1: Math.min(...idx), c2: Math.max(...idx),
            lock: r.status === "lock",
          };
        }
        return {
          r1: Math.min(r.r1 ?? 0, rMax), r2: Math.min(r.r2 ?? 0, rMax),
          c1: Math.min(r.c1 ?? 0, cMax), c2: Math.min(r.c2 ?? 0, cMax),
          lock: r.status === "lock",
        };
      });
  }, [scopes, pv, form.userId, form.tabelId, selectedWorkbookKey]);

  // Gabungan dua lapisan (Scope + Izin lama) menjadi satu daftar. Baris cerminan
  // scope tetap ditampilkan agar keterkaitannya terlihat (ditandai "Cerminan").
  const mergedRows = React.useMemo(() => {
    const rows = [
      ...scopes.map((r) => ({ key: `s${r.id}`, kind: "scope", row: r })),
      ...perms.map((p) => ({ key: `p${p.id}`, kind: "perm", row: p })),
    ];
    const adminOf = (m) => String((m.kind === "scope" ? m.row.nama_admin : m.row.nama_user) || "");
    const bookOf = (m) => String((m.kind === "scope" ? (m.row.workbookName || m.row.workbookKey) : (m.row.nama_tabel)) || "");
    return rows.sort((a, b) => {
      const an = adminOf(a).localeCompare(adminOf(b));
      if (an) return an;
      const ab = bookOf(a).localeCompare(bookOf(b));
      if (ab) return ab;
      return a.kind.localeCompare(b.kind);
    });
  }, [scopes, perms]);

  // Chip per rentang untuk tabel status penugasan (poin Range | Status | Admin).
  const rangeChips = (p) => {
    const izin = p.baris_izin;
    if (!izin) return null;
    const rangesArr = Array.isArray(izin.ranges) ? izin.ranges : [];
    const locksArr = Array.isArray(izin.locks) ? izin.locks : [];
    if (!rangesArr.length && !locksArr.length) return null;
    const chip = (r, st) => (
      <span key={`${r.awal}-${r.akhir}-${st}`} style={{ display: "inline-block", margin: "3px 4px 0 0", padding: "1px 7px", borderRadius: 6, fontSize: 11, background: st === "edit" ? "#d1fae5" : "#fee2e2", color: st === "edit" ? "#047857" : "#b91c1c" }}>
        {rangeStr(r)} {st === "edit" ? "editable" : "lock"}
      </span>
    );
    const all = [];
    rangesArr.forEach((r) => all.push(chip(r, "edit")));
    locksArr.forEach((r) => all.push(chip(r, "lock")));
    return <div style={{ marginTop: 4 }}>{all}</div>;
  };

  // Toolbar aksi terpadu. HANYA mengenai area yang sedang dipilih (cell/range/
  // baris/kolom) atau Seluruh Sheet / Seluruh File. Lock dan Entry terpisah.
  const scopeActionBar = (
    <div className="psg-scope-actions">
      <div className="psg-selinfo">
        <span className="psg-sel-label">
          Pilihan:{" "}
          <b>
            {scopeLevel === "workbook"
              ? "Seluruh File"
              : scopeLevel === "sheet"
                ? "Seluruh Sheet"
                : selLabel() || "—"}
          </b>
        </span>
        {scopeLevel === "selection" && (
          <span className="psg-sel-level">
            {gridSel ? `Level: ${derivedLevel() || "-"}` : "Klik / drag area di tabel (cell, nomor baris, atau huruf kolom)"}
          </span>
        )}
        <span className="psg-sel-state">
          {form.locked ? "🔒 Locked" : "🔓 Unlocked"} · {form.canEntry ? "✏️ Entry diizinkan" : "🚫 Tanpa Entry"}
        </span>
      </div>
      <div className="psg-actbtns">
        <button type="button" className={`btn btn-sm ${form.locked ? "btn-primary" : "btn-outline"}`} onClick={() => applyScope("lock")} disabled={loading}>🔒 Lock</button>
        <button type="button" className={`btn btn-sm ${!form.locked ? "btn-primary" : "btn-outline"}`} onClick={() => applyScope("unlock")} disabled={loading}>🔓 Unlock</button>
        <button type="button" className={`btn btn-sm ${form.canEntry ? "btn-primary" : "btn-outline"}`} onClick={() => applyScope("entry")} disabled={loading}>✏️ Allow Entry</button>
        <button type="button" className={`btn btn-sm ${!form.canEntry ? "btn-primary" : "btn-outline"}`} onClick={() => applyScope("noentry")} disabled={loading}>🚫 No Entry</button>
        <button type="button" className="btn btn-sm" onClick={() => { setGridSel(null); gridSelRef.current = null; }}>✕ Bersihkan</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="psg-hero">
        <div className="psg-hero-ico" aria-hidden="true">🛡️</div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2>Penugasan Tabel Admin</h2>
          <p>
            Tentukan hak akses Admin pada workbook &amp; sheet <b>asli</b> — tanpa menyalin data.
            Pilih Admin, File/Workbook, lalu level cakupan. Aturan paling spesifik yang berlaku menang
            (File → Sheet → Kolom/Baris → Range → Cell).
          </p>
          <div className="psg-stats">
            <span className="psg-stat">👤 <b>{admins.length}</b> admin</span>
            <span className="psg-stat">📁 <b>{fileOptions.length}</b> workbook</span>
            <span className="psg-stat">📋 <b>{scopes.length}</b> aturan</span>
            {perms.length > 0 && <span className="psg-stat">🗂️ <b>{perms.length}</b> izin lama</span>}
          </div>
        </div>
      </div>

      <div className="card psg-card">
        <div className="psg-head">
          <div>
            <h3>➕ Buat / Perbarui Aturan</h3>
            <div className="psg-sub">Pilih Admin &amp; File, lalu <b>blok area di pratinjau</b> (cell/range, nomor baris, atau huruf kolom) dan tekan <b>Lock / Unlock / Allow Entry</b>. Aksi hanya berlaku pada area yang dipilih.</div>
          </div>
        </div>
        <form className="psg-body" onSubmit={(e) => { e.preventDefault(); applyScope("save"); }}>
          <div className="psg-grid">
            <div className="form-group" style={{ margin: 0 }}>
              <label>Admin <span className="psg-req">*</span></label>
              <Dropdown
                value={form.userId}
                onChange={(v) => setForm((f) => ({ ...f, userId: v }))}
                options={[
                  { value: "", label: "Pilih admin..." },
                  ...admins.map((a) => ({ value: String(a.id), label: `${a.nama} (${a.email})` })),
                ]}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>File / Workbook <span className="psg-req">*</span></label>
              <Dropdown
                value={form.fileId}
                onChange={(f) => { onFileChange(f); resetScope(); }}
                options={[
                  { value: "", label: "Semua file" },
                  ...fileOptions.map((g) => ({ value: g.key, label: g.label })),
                ]}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Sheet</label>
              <Dropdown
                value={form.tabelId}
                onChange={(t) => { onSheetChange(t); resetScope(); }}
                disabled={scopeLevel === "workbook"}
                options={[
                  { value: "", label: form.fileId ? "Semua sheet (lihat semua sheet di file ini)" : "Pilih sheet..." },
                  ...sheetOptions.map((t) => ({ value: t.value, label: t.label, disabled: t.disabled })),
                ]}
              />
              {scopeLevel === "workbook" && (
                <div className="psg-hint" style={{ marginTop: 6 }}>
                  Cakupan <b>Seluruh File</b>: aturan berlaku ke semua sheet pada file ini. Pilih satu sheet bila ingin mengatur per-sheet.
                </div>
              )}
            </div>
          </div>

          <div className="psg-field">
            <label>Cakupan</label>
            <div className="psg-levels">
              {[
                ["selection", "Seleksi Grid", "▦"],
                ["sheet", "Seluruh Sheet", "📄"],
                ["workbook", "Seluruh File", "📁"],
              ].map(([lv, label, ico]) => (
                <button
                  key={lv}
                  type="button"
                  className={`psg-level ${scopeLevel === lv ? "active" : ""}`}
                  onClick={() => onLevelChange(lv)}
                >
                  <span className="psg-ico" aria-hidden="true">{ico}</span>
                  {label}
                </button>
              ))}
            </div>
            <div className="psg-hint" style={{ marginTop: 6 }}>
              <b>Seleksi Grid</b>: blok cell secara bebas (klik / drag, klik nomor baris, klik huruf kolom). Cakupan (cell / range / baris / kolom / sheet) ditentukan otomatis dari blok yang dipilih — Lock/Unlock <b>hanya berlaku pada area itu</b>, bukan seluruh tabel.
            </div>
          </div>

          <div className="psg-actions">
            <button className="btn btn-primary" type="submit" disabled={loading}>💾 Simpan</button>
            <button className="btn" type="button" onClick={fetchAll} disabled={loading}>↻ Muat Ulang</button>
            <span className="psg-hint">🔒 Rumus (formula) selalu terkunci untuk Admin.</span>
          </div>
        </form>
      </div>

      {selectedWorkbookKey && !form.tabelId && (
        <div className="card psg-card">
          <div className="psg-head">
            <div>
              <h3>📁 {String(fileLabel(selectedWorkbookKey, selectedSheet || {})).toUpperCase()}</h3>
              <div className="psg-sub">Cakupan: <b>Seluruh File</b> — pilih salah satu sheet di bawah, lalu blok area untuk Lock/Unlock/Entry.</div>
            </div>
            <div className="psg-head-tools">
              <span className="psg-count" title="Jumlah sheet">{pvNames.length || pvSheets.length} sheet</span>
            </div>
          </div>
          <div className="psg-body">
            {scopeActionBar}
            <div className="psg-zoombar-row">
              <ZoomBar zoom={zoom} onOut={zoomOut} onIn={zoomIn} onReset={zoomReset} />
              <span className="psg-zoom-note">
                Zoom berlaku untuk sheet aktif{activeSheet ? <> (<b>{activeSheet.name}</b>)</> : null}.
              </span>
            </div>

            {pvLoading && !pvNames.length && (
              <p className="text-muted">Memuat daftar sheet dari Workbook...</p>
            )}

            {pvNames.length > 0 && (
              <div className="psg-sheetlist" role="tablist" aria-label="Daftar sheet pada file ini">
                {pvNames.map((n) => {
                  const built = pvSheets.some((s) => s.name === n);
                  const isActive = !!activeSheet && activeSheet.name === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`psg-sheetchip${isActive ? " active" : ""}${built ? "" : " loading"}`}
                      onClick={() => onPickSheet(n)}
                      title={built ? n : `Memuat ${n}...`}
                    >
                      <span className="psg-ico" aria-hidden="true">📄</span>
                      <span className="psg-sheetchip-name">{n}</span>
                      {!built && <span className="psg-sheetchip-load" aria-hidden="true">…</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {!pvNames.length && !pvLoading && (
              <p className="text-muted">{pvMsg || "Tidak ada sheet untuk ditampilkan."}</p>
            )}

            {pvNames.length > 0 && activeSheet && (
              <div className="psg-wb-zoom">
                <div className="psg-previewbox">
                  <div className="psg-preview-head">
                    <span className="psg-sheet-name">
                      <span className="psg-ico" aria-hidden="true">📄</span>
                      SHEET: {activeSheet.name}
                    </span>
                    <span className="psg-sheet-meta">{activeSheet.rows.length} baris × {activeSheet.columns.length} kolom</span>
                  </div>
                  <PreviewScroll onPinch={onPinch}>
                    <PreviewGrid
                      key={`wbpv:${form.fileId}:${activeSheet.name}:${activeSheet.rows.length}`}
                      rows={activeSheet.rows}
                      columns={activeSheet.columns}
                      computed={computedActive}
                      merges={activeSheet.merges || EMPTY_ARR}
                      freezePane={activeSheet.freeze || null}
                      images={activeSheet.images || EMPTY_ARR}
                      readOnly
                      onChange={PV_NOOP}
                      onSelectionChange={onGridSel}
                      rangeHighlights={highlightsActive}
                      zoom={zoom}
                      onZoomChange={clampZoom}
                    />
                  </PreviewScroll>
                </div>
                <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
                  Ditampilkan satu sheet pada satu waktu (renderisasi bertahap) agar halaman tetap ringan. <b>Warna overlay</b>: merah = terkunci, hijau = boleh diedit.
                </p>
              </div>
            )}

            {pvNames.length > 0 && !activeSheet && (
              <p className="text-muted">Memuat isi sheet “{pvActive || pvNames[0]}”...</p>
            )}
          </div>
        </div>
      )}

      {form.tabelId && (
        <div className="card psg-card">
          <div className="psg-head">
            <div>
              <h3>👁️ Pratinjau Sheet Asli</h3>
              <div className="psg-sub">
                {pv ? pv.sheetName : (spreadsheets.find((s) => String(s.id) === String(form.tabelId))?.nama || form.tabelId)}
              </div>
            </div>
            {pv && (
              <div className="psg-head-tools">
                <span className="psg-count" title="Ukuran sheet">{pv.rows.length} × {pv.columns.length}</span>
                <ZoomBar zoom={zoom} onOut={zoomOut} onIn={zoomIn} onReset={zoomReset} />
              </div>
            )}
          </div>
          <div className="psg-body">
            {pvLoading && <p className="text-muted">Memuat isi sheet...</p>}
            {!pv && !pvLoading && <p className="text-muted">{pvMsg || "Memuat isi sheet..."}</p>}
            {pv && (
              <>
                {scopeActionBar}
                <div className="psg-previewbox">
                  <PreviewScroll onPinch={onPinch}>
                    <PreviewGrid
                      key={`${form.tabelId}:${pv.sheetName}:${pv.rows.length}`}
                      rows={pv.rows}
                      columns={pv.columns}
                      computed={computed}
                      merges={pv.merges || EMPTY_ARR}
                      freezePane={pv.freezePane}
                      images={pv.images || EMPTY_ARR}
                      readOnly
                      onChange={PV_NOOP}
                      onSelectionChange={onGridSel}
                      rangeHighlights={scopeHighlights}
                      zoom={zoom}
                      onZoomChange={clampZoom}
                    />
                  </PreviewScroll>
                </div>
                <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
                  <b>Warna overlay</b>: merah = terkunci, hijau = boleh diedit.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card psg-card">
        <div className="psg-head">
          <div>
            <h3>📋 Aturan &amp; Izin Penugasan <span className="psg-count">{mergedRows.length}</span></h3>
            <div className="psg-sub">
              Satu tabel gabungan dua lapisan: <b>Scope</b> ({scopes.length}) dan <b>Izin lama</b> ({perms.length}).
              Baris <b>Cerminan scope</b> dibuat otomatis dari aturan scope. Kedua lapisan berlaku <b>AND</b> saat mengunci akses.
            </div>
          </div>
          <button className="btn btn-sm" type="button" onClick={fetchAll}>↻ Muat Ulang</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>ID</th>
                <th>Admin</th>
                <th>File / Tabel</th>
                <th style={{ width: 130 }}>Lapisan</th>
                <th>Cakupan</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 64 }}>Entry</th>
                <th style={{ width: 64 }}>Edit</th>
                <th style={{ width: 160 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {mergedRows.map((m) => m.kind === "scope" ? (
                <tr key={m.key}>
                  <td className="text-muted">S{m.row.id}</td>
                  <td className="font-bold">{m.row.nama_admin || `User #${m.row.admin_id}`}</td>
                  <td>{m.row.workbookName || m.row.workbookKey}</td>
                  <td><span className="badge psg-level-badge">Scope · {m.row.level}</span></td>
                  <td className="font-bold">{m.row.label || scopeScopeLabel(m.row)}</td>
                  <td>
                    <span className={`psg-status ${m.row.status === "lock" ? "lock" : "unlock"}`}>
                      {m.row.status === "lock" ? "🔒 LOCK" : "🔓 UNLOCK"}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm" title="Izin Entry pada area ini (terpisah dari Lock)" onClick={() => toggleScopeEntry(m.row)}>
                      {m.row.canEntry !== false ? "✏️ Ya" : "🚫 Tidak"}
                    </button>
                  </td>
                  <td className="text-muted">{m.row.canEdit !== false ? "✅" : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => toggleScopeStatus(m.row)}>
                        {m.row.status === "lock" ? "🔓 Unlock" : "🔒 Lock"}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget({ kind: "scope", rule: m.row, label: m.row.label || scopeScopeLabel(m.row) })}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={m.key}>
                  <td className="text-muted">{m.row.id}</td>
                  <td className="font-bold">{m.row.nama_user || `User #${m.row.user_id}`}</td>
                  <td>{m.row.nama_tabel || `Tabel #${m.row.tabel_id}`}</td>
                  <td>
                    <span
                      className="badge psg-level-badge"
                      title={
                        m.row.asal === "scope"
                          ? (m.row.sisa
                            ? "Dibuat otomatis oleh sistem aturan scope, tetapi aturan induknya sudah dihapus."
                            : `Otomatis dicerminkan dari aturan scope. Saat ini ada ${m.row.jumlah_aturan || 0} aturan untuk sheet ini.`)
                          : "Izin lama/manual (lapisan pertama)."
                      }
                    >
                      {m.row.asal === "scope" ? (m.row.sisa ? "Cerminan · sisa" : "Cerminan scope") : "Izin lama"}
                    </span>
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <span style={{ fontSize: 12 }}>{scopeLabel(m.row)}</span>
                    {rangeChips(m.row)}
                  </td>
                  <td className="text-muted">—</td>
                  <td><Toggle value={m.row.can_entry} onChange={(v) => toggleFlag(m.row, "can_entry", v ? 1 : 0)} /></td>
                  <td><Toggle value={m.row.can_edit} onChange={(v) => toggleFlag(m.row, "can_edit", v ? 1 : 0)} /></td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget({ kind: "perm", perm: m.row, label: `${m.row.nama_user || `User #${m.row.user_id}`} — ${m.row.nama_tabel || `Tabel #${m.row.tabel_id}`}` })}>Hapus</button>
                  </td>
                </tr>
              ))}
              {mergedRows.length === 0 && !loading && (
                <tr><td colSpan="9"><div className="psg-empty"><div className="big">🗂️</div>Belum ada aturan/izin penugasan.<br />Buat aturan pertama lewat form di atas.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.kind === "scope" ? "Hapus Aturan Penugasan" : "Hapus Penugasan"}
          message={
            deleteTarget.kind === "scope"
              ? `Hapus aturan penugasan "${deleteTarget.label}"? Tindakan ini tidak dapat dibatalkan.`
              : `Hapus penugasan "${deleteTarget.label}"? Tindakan ini tidak dapat dibatalkan.`
          }
          danger
          confirmLabel="Ya, Hapus"
          cancelLabel="Tidak"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const t = deleteTarget;
            setDeleteTarget(null);
            if (t.kind === "scope") await removeScope(t.rule);
            else await remove(t.perm);
          }}
        />
      )}
    </>
  );
}

// ====== 3. Maintenance Mode ======

export function AdminMaintenance() {
  const toast = useToast();
  const [form, setForm] = React.useState({ active: false, title: "Maintenance", message: "", start_at: "", end_at: "" });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    api.getMaintenance().then((m) => {
      setForm({
        active: !!m.active,
        title: m.title || "Maintenance",
        message: m.message || "",
        start_at: (m.start_at || "").slice(0, 16),
        end_at: (m.end_at || "").slice(0, 16),
      });
    }).catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        active: form.active,
        title: form.title,
        message: form.message,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      };
      const res = await api.setMaintenance(body);
      toast(res.message || "Pengaturan maintenance disimpan");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <h2>Maintenance Mode</h2>
        <p>Blokir sementara akses seluruh User &amp; Admin. Super Admin tetap dapat masuk.</p>
      </div>

      <div className="card">
        <form onSubmit={submit} style={{ padding: 18, maxWidth: 640 }}>
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <Toggle value={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              <strong>Aktifkan Maintenance sekarang</strong>
            </label>
          </div>
          <div className="form-group">
            <label>Judul</label>
            <input className="form-control" value={form.title} onChange={set("title")} placeholder="Maintenance" />
          </div>
          <div className="form-group">
            <label>Pesan</label>
            <textarea className="form-control" rows="3" value={form.message} onChange={set("message")} placeholder="Sedang perbaikan sistem, mohon kembali nanti." />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label>Mulai (opsional)</label>
              <input className="form-control" type="datetime-local" value={form.start_at} onChange={set("start_at")} />
            </div>
            <div className="form-group">
              <label>Selesai (opsional)</label>
              <input className="form-control" type="datetime-local" value={form.end_at} onChange={set("end_at")} />
            </div>
          </div>
          <p className="text-muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>
            Jika jadwal kosong, maintenance berjalan tanpa batas waktu sampai dinonaktifkan. Di luar jadwal yang ditentukan, sistem kembali normal otomatis.
          </p>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : form.active ? "Simpan & Nyalakan" : "Simpan"}
          </button>
        </form>
      </div>
    </>
  );
}

// ====== 4. Backup / Restore ======

export function AdminBackup() {
  const toast = useToast();
  const [backups, setBackups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [restoreTarget, setRestoreTarget] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const fetchAll = React.useCallback(async () => {
    try {
      setBackups(await api.getBackups());
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createBackup();
      toast(res.message);
      await fetchAll();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const restore = async () => {
    try {
      const res = await api.restoreBackup(restoreTarget.id);
      const lines = Object.entries(res.report || {})
        .map(([t, n]) => `${t}: ${formatNumber(n)} baris`)
        .join(", ");
      toast(`Restore selesai. ${lines}`);
      setRestoreTarget(null);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async () => {
    try {
      await api.deleteBackup(deleteTarget.id);
      toast("Backup berhasil dihapus");
      setDeleteTarget(null);
      await fetchAll();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const fmtUkuran = (n) => {
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
  };

  return (
    <>
      <div className="page-title">
        <h2>Backup &amp; Restore</h2>
        <p>Amankan data sebelum perubahan besar. Restore bersifat menggabung (merge) tanpa menghapus data yang tidak ada di backup.</p>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <button className="btn btn-primary" onClick={create} disabled={creating}>
          {creating ? "Membuat backup..." : "+ Buat Backup Baru"}
        </button>
        <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
          Seluruh tabel (kecuali sesi login &amp; arsip backup) disalin menjadi satu berkas JSON yang aman.
        </p>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>ID</th>
                <th>Nama</th>
                <th>Ukuran</th>
                <th>Dibuat</th>
                <th style={{ width: 220 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id}>
                  <td className="text-muted">{b.id}</td>
                  <td className="font-bold">{b.nama}</td>
                  <td>{fmtUkuran(b.ukuran || 0)}</td>
                  <td className="text-muted">{b.dibuat_oleh ? `${b.dibuat_oleh} · ` : ""}{formatTanggal(b.created_at)} {backups.length ? "" : ""}</td>
                  <td>
                    <a className="btn btn-sm" href={api.downloadBackupUrl(b.id)} download>Unduh</a>{" "}
                    <button className="btn btn-sm" onClick={() => setRestoreTarget(b)}>Restore</button>{" "}
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(b)}>Hapus</button>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && !loading && (
                <tr><td colSpan="5"><div className="empty-state">Belum ada backup. Buat backup pertama Anda.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {restoreTarget && (
        <ConfirmDialog
          title="Restore Backup"
          message={`Pulihkan data dari backup "${restoreTarget.nama}"? Proses ini MENGGABUNG (upsert) data backup ke tabel yang ada — tidak menghapus data lain.`}
          onCancel={() => setRestoreTarget(null)}
          onConfirm={restore}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Hapus Backup"
          message={`Hapus backup "${deleteTarget.nama}"? File yang sudah diunduh tidak terpengaruh.`}
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}

// ====== 5. Pengaturan Umum ======

export function AdminSettings() {
  const toast = useToast();
  const [allowRegister, setAllowRegister] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    api.getAdminSettings().then((s) => setAllowRegister(s.allow_register !== false)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.setAdminSettings({ allow_register: allowRegister });
      toast(res.message);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <h2>Website / System Settings</h2>
        <p>Pengaturan umum aplikasi.</p>
      </div>

      <div className="card" style={{ padding: 18, maxWidth: 640 }}>
        <form onSubmit={submit}>
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <Toggle value={allowRegister} onChange={setAllowRegister} />
              <strong>Izinkan pendaftaran terbuka (User baru)</strong>
            </label>
            <p className="text-muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Bila dinonaktifkan, halaman daftar tidak digunakan; semua akun dibuat oleh Super Admin di panel
              User &amp; Admin Management.
            </p>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </button>
        </form>
      </div>
    </>
  );
}

// ====== Halaman maintenance untuk User (tampilan lama, tidak diubah) ======

export function MaintenancePage({ maintenance, onLogout }) {
  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="auth-hero" />
        <div className="auth-col">
          <div className="auth-card" style={{ textAlign: "center" }}>
            <div className="brand-logo" style={{ margin: "0 auto 14px", width: 52, height: 52, fontSize: 24 }}>S</div>
            <h1 className="auth-title">{maintenance?.title || "Sedang Maintenance"}</h1>
            <p className="auth-subtitle" style={{ whiteSpace: "pre-line" }}>
              {maintenance?.message || "Sistem sedang dalam perawatan. Silakan kembali beberapa saat lagi."}
            </p>
            {maintenance?.end_at && (
              <p className="text-muted" style={{ fontSize: 13 }}>
                Diperkirakan selesai: {new Date(maintenance.end_at).toLocaleString("id-ID")}
              </p>
            )}
            <button className="btn btn-primary btn-block" onClick={onLogout}>
              Keluar / Ganti Akun
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== Halaman maintenance khusus Admin (tampilan baru, hanya Admin) ======
// User tetap memakai MaintenancePage di atas. Komponen ini dipakai saat
// role === "admin" dan maintenance aktif: info jadwal + status lebih jelas.

export function AdminMaintenanceBlockedPage({ maintenance, user, onLogout }) {
  const endText = maintenance?.end_at
    ? new Date(maintenance.end_at).toLocaleString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const startText = maintenance?.start_at
    ? new Date(maintenance.start_at).toLocaleString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="maint-admin-page">
      <div className="maint-admin-card">
        <div className="maint-admin-top">
          <div className="maint-admin-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M12 3L2.5 20h19L12 3z" fill="#f59e0b" />
              <rect x="11" y="9" width="2" height="6" rx="1" fill="#fff" />
              <circle cx="12" cy="17.2" r="1.2" fill="#fff" />
            </svg>
          </div>
          <div>
            <span className="maint-admin-badge">
              <span className="dot" />
              Maintenance aktif — mode Admin
            </span>
            <h1>{maintenance?.title || "Sistem Sedang Maintenance"}</h1>
            <p className="maint-admin-user">
              Halo, <strong>{user?.nama || "Admin"}</strong> ({user?.email || "admin"}). Akses
              Admin dibatasi sementara oleh Super Admin.
            </p>
          </div>
        </div>

        <p className="maint-admin-msg">
          {maintenance?.message || "Sistem sedang dalam perawatan. Seluruh akses Admin & User dihentikan sementara. Silakan kembali setelah maintenance selesai."}
        </p>

        <div className="maint-admin-grid">
          <div className="maint-admin-info">
            <span className="label">Mulai</span>
            <strong>{startText || "Sekarang"}</strong>
          </div>
          <div className="maint-admin-info">
            <span className="label">Perkiraan selesai</span>
            <strong>{endText || "Menunggu info Super Admin"}</strong>
          </div>
          <div className="maint-admin-info">
            <span className="label">Yang tetap aktif</span>
            <strong>Super Admin tetap dapat masuk</strong>
          </div>
        </div>

        <div className="maint-admin-actions">
          <button className="btn btn-outline" onClick={() => window.location.reload()}>
            Coba Lagi / Muat Ulang
          </button>
          <button className="btn btn-primary" onClick={onLogout}>
            Keluar / Ganti Akun
          </button>
        </div>
        <p className="maint-admin-foot">
          Butuh akses darurat? Hubungi Super Admin. Halaman ini otomatis kembali normal
          setelah maintenance dinonaktifkan.
        </p>
      </div>
    </div>
  );
}