import React from "react";
import Modal from "./Modal.jsx";
import { api } from "../api.js";
import { useToast } from "./Toast.jsx";
import { IconCamera, IconLogout, IconTrash } from "./Icons.jsx";

const AVATAR_SIZE = 160;

function formatTanggalId(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
}

export default function ProfileModal({ user, onClose, onUpdated, onLogout, onAccountDeleted }) {
  const toast = useToast();
  const [nama, setNama] = React.useState(user?.nama || "");
  const [email, setEmail] = React.useState(user?.email || "");
  const [avatar, setAvatar] = React.useState(user?.avatar || "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar (JPG/PNG)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = AVATAR_SIZE;
          canvas.height = AVATAR_SIZE;
          const ctx = canvas.getContext("2d");
          const src = Math.min(img.width, img.height);
          const sx = (img.width - src) / 2;
          const sy = (img.height - src) / 2;
          ctx.drawImage(img, sx, sy, src, src, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
          setAvatar(canvas.toDataURL("image/jpeg", 0.85));
          setError("");
        } catch {
          setError("Gagal memproses gambar");
        }
      };
      img.onerror = () => setError("Gagal membaca gambar");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const hapusFoto = () => {
    setAvatar("");
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!nama.trim()) return setError("Nama wajib diisi");
    if (nama.trim().length < 2) return setError("Nama terlalu pendek (minimal 2 karakter)");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Format email tidak valid");

    setSaving(true);
    try {
      const res = await api.updateProfile({
        nama: nama.trim(),
        email: email.trim(),
        avatar,
      });
      if (onUpdated) onUpdated(res.user);
      toast(res.message || "Profil berhasil diperbarui");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const joinDate = formatTanggalId(user?.created_at);

  const handleLogout = async () => {
    if (!onLogout) return;
    try {
      await onLogout();
      toast("Anda telah keluar");
    } catch {
      /* abaikan error saat logout */
    } finally {
      if (onClose) onClose();
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    setError("");
    try {
      await api.deleteAccount();
      toast("Akun berhasil dihapus");
      if (onAccountDeleted) onAccountDeleted();
      else if (onClose) onClose();
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Profil"
      onClose={onClose}
      footer={
        <>
          {onLogout && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleLogout}
              style={{ marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <IconLogout size={14} /> Logout
            </button>
          )}
          <button className="btn btn-outline" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" form="form-profil" type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </>
      }
    >
      <form id="form-profil" onSubmit={submit} noValidate>
        <div className="profile-avatar-wrap">
          <div className="profile-avatar">
            {avatar ? (
              <img src={avatar} alt="Foto profil" />
            ) : (
              <span>{(user?.nama || "U").slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="profile-avatar-actions">
            <label className="btn btn-soft btn-sm profile-avatar-btn">
              <IconCamera size={14} />
              Ubah Foto
              <input type="file" accept="image/*" onChange={onFile} hidden />
            </label>
            {avatar ? (
              <button type="button" className="btn btn-outline btn-sm profile-avatar-btn" onClick={hapusFoto}
                title="Hapus foto profil ini">
                <IconTrash size={14} />
                Hapus Foto
              </button>
            ) : null}
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="form-group">
          <label>Nama</label>
          <input className="form-control" value={nama} onChange={(e) => setNama(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="profile-meta">
          <span className="profile-meta-label">Akun dibuat pada</span>
          <strong>{joinDate}</strong>
        </div>

        <div className="profile-danger">
          <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => setConfirmDelete(true)}>
            <IconTrash size={14} /> Hapus Akun
          </button>
          <p>
            Menghapus akun akan otomatis mengakhiri semua sesi login.
          </p>
        </div>
      </form>

      {confirmDelete && (
        <Modal
          title="Hapus Akun"
          onClose={() => !deleting && setConfirmDelete(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Batal
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteAccount} disabled={deleting}>
                {deleting ? "Menghapus..." : "Ya, Hapus Akun"}
              </button>
            </>
          }
        >
          <p>
            Yakin ingin menghapus akun <b>{user?.email}</b> secara permanen?
          </p>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
            Tindakan ini tidak dapat dibatalkan, dan Anda akan logout otomatis.
          </p>
        </Modal>
      )}
    </Modal>
  );
}