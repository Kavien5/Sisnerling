import React from "react";
import Modal from "./Modal.jsx";
import { api } from "../api.js";

export function avatarColor(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 45%)`;
}

const initials = (nama) =>
  String(nama || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export function CollabBar({
  mode, users, saveStatus, pendingCount, lastSavedAt, lastEdit, me,
  onShare, onRevisions, onResync,
}) {
  const dot =
    mode === "live" ? "#22c55e" : mode === "offline" ? "#f59e0b" : mode === "denied" ? "#ef4444" : "#94a3b8";
  const modeText =
    mode === "live" ? "Kolaborasi aktif" : mode === "connecting" ? "Menghubungkan…" :
    mode === "offline" ? "Offline — perubahan diantrekan" : mode === "denied" ? "Tidak ada akses" :
    mode === "error" ? "Gagal memuat" : "Kolaborasi mati";
  const saveText =
    saveStatus === "menyimpan" ? "Menyimpan…" : saveStatus === "tersimpan" ? `Tersimpan${lastSavedAt ? " " + lastSavedAt.toLocaleTimeString("id-ID") : ""}` :
    saveStatus === "gagal" ? "Gagal menyimpan" : saveStatus === "offline" ? `Antre ${pendingCount} perubahan` : "";
  return (
    <div className="collab-bar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot, display: "inline-block" }} />
        {modeText}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        {users.map((u) => (
          <span key={u.id} title={`${u.nama}${u.id === me?.id ? " (Anda)" : ""} — ${u.role}`}
            style={{ width: 24, height: 24, borderRadius: "50%", background: avatarColor(u.id), color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: -4, border: "2px solid #fff" }}>
            {initials(u.nama)}
          </span>
        ))}
        <span style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}>
          {users.length ? `${users.length} online` : ""}
        </span>
      </span>
      {saveText && <span style={{ fontSize: 12, color: saveStatus === "gagal" ? "#dc2626" : "#64748b" }}>{saveText}</span>}
      {lastEdit && (
        <span style={{ fontSize: 12, color: "#64748b" }} title={`Baris ${lastEdit.kode || ""}`}>
          Terakhir: {lastEdit.byNama} · {lastEdit.at ? new Date(lastEdit.at).toLocaleTimeString("id-ID") : ""}
        </span>
      )}
      <span style={{ flex: 1 }} />
      <button className="btn btn-outline btn-sm" onClick={onResync} title="Muat ulang data terbaru dari server">Sinkron</button>
      <button className="btn btn-outline btn-sm" onClick={onRevisions} title="Riwayat revisi & pulihkan versi">Revisi</button>
      <button className="btn btn-outline btn-sm" onClick={onShare} title="Lihat & kelola akses file">Bagikan</button>
    </div>
  );
}

export function ConflictModal({ conflicts, onResolve }) {
  if (!conflicts.length) return null;
  return (
    <Modal title={`Konflik penyimpanan (${conflicts.length})`} onClose={() => onResolve(conflicts[0].key, "reload")} width={560}>
      <p style={{ fontSize: 13, color: "#475569" }}>
        Sel berikut diubah pengguna lain setelah Anda mengeditnya. Pilih nilai yang dipakai — tidak ada yang tertimpa diam-diam.
      </p>
      {conflicts.map((c) => (
        <div key={c.key} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            Baris <code>{c.rowKode}</code> · kolom {c.colLabel}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, fontSize: 13 }}>
            <div style={{ background: "#fef9c3", borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 11, color: "#854d0e" }}>Nilai Anda</div>
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{String(c.localValue ?? "")}</div>
            </div>
            <div style={{ background: "#dcfce7", borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 11, color: "#166534" }}>Terbaru — {c.byNama}</div>
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                {String((c.current && (c.current[c.serverColKey] ?? (c.current.nilai && c.current.nilai[c.serverColKey]))) ?? "")}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-outline btn-sm" onClick={() => onResolve(c.key, "reload")}>Pakai data terbaru</button>
            <button className="btn btn-sm" onClick={() => onResolve(c.key, "overwrite")}>Timpa dengan nilaiku</button>
          </div>
        </div>
      ))}
    </Modal>
  );
}

export function ShareDialog({ shares, canManage, onGrant, onSet, onRevoke, onClose }) {
  const [email, setEmail] = React.useState("");
  const [peran, setPeran] = React.useState("viewer");
  const [busy, setBusy] = React.useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await onGrant(email.trim(), peran);
      setEmail("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Akses file" onClose={onClose} width={600}>
      {canManage && (
        <form onSubmit={submit} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="form-control" placeholder="Email pengguna" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
          <select className="form-control" value={peran} onChange={(e) => setPeran(e.target.value)} style={{ width: 120 }}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button className="btn btn-sm" disabled={busy} type="submit">Beri akses</button>
        </form>
      )}
      {!shares.length && <p style={{ fontSize: 13, color: "#64748b" }}>Belum ada pengguna yang diberi akses eksplisit.</p>}
      {shares.map((s) => (
        <div key={s.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
          <span style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColor(s.user_id), color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {initials(s.nama)}
          </span>
          <span style={{ flex: 1 }}>
            <b>{s.nama}</b> <span style={{ color: "#64748b" }}>{s.email} · {s.role}</span>
          </span>
          {canManage ? (
            <>
              <select className="form-control" value={s.peran} onChange={(e) => onSet(s.user_id, e.target.value)} style={{ width: 110, padding: "4px 6px" }}>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button className="btn btn-outline btn-sm" onClick={() => { if (window.confirm(`Cabut akses ${s.nama}?`)) onRevoke(s.user_id); }}>Cabut</button>
            </>
          ) : (
            <span style={{ color: "#64748b" }}>{s.peran === "editor" ? "Editor" : "Viewer"}</span>
          )}
        </div>
      ))}
      {!canManage && <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Hanya Admin utama yang dapat mengubah akses.</p>}
    </Modal>
  );
}

export function RevisionPanel({ sheetId, sheetName, revisions, canWrite, canRestore, onCreate, onRestore, onClose }) {
  const [detail, setDetail] = React.useState(null);
  const [compareId, setCompareId] = React.useState("");
  const [compare, setCompare] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const openDetail = async (revId) => {
    setBusy(true);
    try {
      const d = await api.collabRevisionDetail(revId);
      setDetail(d);
      setCompare(null);
      setCompareId("");
    } finally {
      setBusy(false);
    }
  };
  const runCompare = async () => {
    if (!detail || !compareId) return;
    setBusy(true);
    try {
      const other = await api.collabRevisionDetail(Number(compareId));
      const a = new Map((detail.data || []).map((r) => [r.kode, r]));
      const b = new Map((other.data || []).map((r) => [r.kode, r]));
      const added = [...b.keys()].filter((k) => !a.has(k));
      const removed = [...a.keys()].filter((k) => !b.has(k));
      const changed = [...a.keys()].filter((k) => {
        if (!b.has(k)) return false;
        return JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k));
      });
      setCompare({ other, added, removed, changed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Revisi — ${sheetName || ""}`} onClose={onClose} width={720}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {canWrite && <button className="btn btn-sm" disabled={busy} onClick={onCreate}>Simpan revisi saat ini</button>}
      </div>
      {!revisions.length && <p style={{ fontSize: 13, color: "#64748b" }}>Belum ada revisi tersimpan.</p>}
      {revisions.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
          <b>v{r.versi_no}</b>
          <span style={{ color: "#64748b" }}>{r.jumlah_baris} baris · {r.dibuat_oleh || "?"} · {new Date(r.created_at).toLocaleString("id-ID")}</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => openDetail(r.id)}>Lihat</button>
          {canRestore && (
            <button className="btn btn-outline btn-sm" disabled={busy}
              onClick={() => { if (window.confirm(`Pulihkan ke v${r.versi_no}? Keadaan saat ini diamankan sebagai revisi baru.`)) onRestore(r.id); }}>
              Pulihkan
            </button>
          )}
        </div>
      ))}
      {detail && (
        <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
          <h4 style={{ fontSize: 14 }}>Isi v{detail.versi_no} ({(detail.data || []).length} baris)</h4>
          <div style={{ display: "flex", gap: 8, margin: "8px 0", alignItems: "center", fontSize: 13 }}>
            <span>Bandingkan dengan:</span>
            <select className="form-control" value={compareId} onChange={(e) => setCompareId(e.target.value)} style={{ width: 140 }}>
              <option value="">— pilih —</option>
              {revisions.filter((r) => r.id !== detail.id).map((r) => (
                <option key={r.id} value={r.id}>v{r.versi_no}</option>
              ))}
            </select>
            <button className="btn btn-outline btn-sm" disabled={busy || !compareId} onClick={runCompare}>Bandingkan</button>
          </div>
          {compare && (
            <p style={{ fontSize: 13 }}>
              vs v{compare.other.versi_no}: <b style={{ color: "#16a34a" }}>+{compare.added.length}</b>{" "}
              <b style={{ color: "#dc2626" }}>−{compare.removed.length}</b>{" "}
              <b style={{ color: "#d97706" }}>~{compare.changed.length} berubah</b>
              {compare.changed.slice(0, 8).join(", ") && <span style={{ color: "#64748b" }}> ({compare.changed.slice(0, 8).join(", ")})</span>}
            </p>
          )}
          <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 6 }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8fafc" }}><th>Kode</th><th>Nama</th><th>Jumlah</th><th>Harga</th><th>Status</th></tr></thead>
              <tbody>
                {(detail.data || []).slice(0, 30).map((row) => (
                  <tr key={row.id || row.kode} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td>{row.kode}</td><td>{row.nama}</td><td>{row.jumlah}</td><td>{row.harga}</td><td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
