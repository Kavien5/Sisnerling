import React from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import AuthField from "../components/AuthField.jsx";

export default function Register({ onRegister, onSwitchToLogin }) {
  const toast = useToast();
  const [form, setForm] = React.useState({
    nama: "",
    email: "",
    password: "",
    konfirmasiPassword: "",
  });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (error) setError("");
  };

  const validate = () => {
    if (form.nama.trim().length < 2) return "Nama terlalu pendek (minimal 2 karakter)";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Format email tidak valid";
    if (!form.password) return "Password wajib diisi";
    if (form.password !== form.konfirmasiPassword) return "Konfirmasi password tidak cocok";
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setLoading(true);
    try {
      const res = await api.register({
        nama: form.nama.trim(),
        email: form.email.trim(),
        password: form.password,
        konfirmasiPassword: form.konfirmasiPassword,
      });
      onRegister(res.token, res.user);
      toast(res.message || "Registrasi berhasil");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="auth-hero">
          <div className="auth-brand">
            <div className="brand-logo">S</div>
            <div className="auth-brand-text">
              <strong>SISNERLING</strong>
              <span>Sistem Neraca Lingkungan</span>
            </div>
          </div>
          <h2 className="auth-hero-title">
            Kelola neraca lingkungan
            <br />
            lebih rapi &amp; mudah.
          </h2>
          <p className="auth-hero-desc">
            Satu tempat untuk mengimpor data Excel, merapikan spreadsheet, dan menyusun
            laporan lingkungan secara cepat dan akurat.
          </p>
          <ul className="auth-features">
            <li>
              <span className="auth-feature-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3.5" y="4" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M3.5 9h17M9 9v11" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </span>
              Import &amp; ekspor file Excel dengan mudah
            </li>
            <li>
              <span className="auth-feature-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3.5" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M3.5 9h17M9 3.5v17" stroke="currentColor" strokeWidth="1.7" opacity="0.45" />
                  <path d="m7 18 3.2-4 2.4 2.5 3-3.5L20 16.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Spreadsheet online yang lengkap
            </li>
            <li>
              <span className="auth-feature-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 19V9.5M10 19V4.5M16 19v-6M21 19H3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Grafik &amp; laporan otomatis
            </li>
            <li>
              <span className="auth-feature-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3.5 19 6v5.5c0 4.6-2.9 7.6-7 9-4.1-1.4-7-4.4-7-9V6l7-2.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="m9.2 12 1.9 1.9 3.7-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Data tersimpan aman di akun Anda
            </li>
          </ul>
        </div>

        <div className="auth-col">
          <div className="auth-card">
            <div className="auth-brand">
              <div className="brand-logo">S</div>
              <div className="auth-brand-text">
                <strong>SISNERLING</strong>
                <span>Sistem Neraca Lingkungan</span>
              </div>
            </div>

            <h1 className="auth-title">Daftar Akun</h1>
            <p className="auth-subtitle">Buat akun baru untuk mulai menggunakan sistem.</p>

            {error && (
              <div className="auth-error">
                <svg className="auth-error-icon" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="16.4" r="1.2" fill="currentColor" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} noValidate>
              <AuthField
                label="Nama"
                icon="user"
                type="text"
                autoComplete="name"
                placeholder="Nama lengkap"
                value={form.nama}
                onChange={set("nama")}
              />
              <AuthField
                label="Email"
                icon="mail"
                type="email"
                autoComplete="email"
                placeholder="nama@email.com"
                value={form.email}
                onChange={set("email")}
              />
              <AuthField
                label="Password"
                icon="lock"
                type="password"
                autoComplete="new-password"
                placeholder="Bebas, sesuai keinginan"
                value={form.password}
                onChange={set("password")}
              />
              <AuthField
                label="Konfirmasi Password"
                icon="lock"
                type="password"
                autoComplete="new-password"
                placeholder="Ulangi password"
                value={form.konfirmasiPassword}
                onChange={set("konfirmasiPassword")}
              />
              <button className="btn btn-primary btn-block auth-btn" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="btn-spinner" />
                    Membuat akun...
                  </>
                ) : (
                  "Daftar"
                )}
              </button>
            </form>

            <p className="auth-switch">
              Sudah punya akun?{" "}
              <button type="button" className="auth-link" onClick={onSwitchToLogin}>
                Masuk
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
