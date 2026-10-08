const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { logAudit } = require("./auditLog");
const { getSecuritySettings } = require("./securitySettings");

const router = express.Router();

const publicUser = (u) => ({
  id: u.id,
  nama: u.nama,
  email: u.email,
  role: u.role || "user",
  avatar: u.avatar || null,
  created_at: u.created_at || null,
});

// ---- RBAC ----
const ROLES = ["user", "admin", "super_admin"];

// Middleware proteksi berbasis peran. Contoh: requireRole("admin", "super_admin")
function requireRole(...roles) {
  return (req, res, next) => {
    const r = req.user ? req.user.role : null;
    if (!r || !roles.includes(r)) {
      return res.status(403).json({ error: "Anda tidak memiliki izin untuk melakukan aksi ini" });
    }
    next();
  };
}

// Cek apakah maintenance mode aktif pada waktu sekarang (untuk gerbang API).
async function isMaintenanceActive() {
  try {
    const [[row]] = await pool.query("SELECT svalue FROM app_settings WHERE skey = 'maintenance'");
    if (!row || !row.svalue) return null;
    const cfg = typeof row.svalue === "string" ? JSON.parse(row.svalue) : row.svalue;
    if (!cfg || !cfg.active) return null;
    const now = Date.now();
    if (cfg.start_at && new Date(cfg.start_at).getTime() > now) return null;
    if (cfg.end_at && new Date(cfg.end_at).getTime() < now) return null;
    return {
      active: true,
      title: cfg.title || "Maintenance",
      message: cfg.message || "",
      start_at: cfg.start_at || null,
      end_at: cfg.end_at || null,
    };
  } catch {
    return null;
  }
}

// Middleware maintenance: user biasa & admin diblokir API; super_admin tetap jalan.
async function maintenanceGuard(req, res, next) {
  try {
    if (req.user && req.user.role === "super_admin") return next();
    const maint = await isMaintenanceActive();
    if (maint) {
      return res.status(503).json({ error: "Sedang maintenance", maintenance: maint });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ---- Validasi ----
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createSession(userId) {
  // Buang sesi lama user yang sudah kedaluwarsa, lalu buat token baru.
  // Durasi berlaku mengikuti pengaturan Super Admin (Keamanan & Sesi).
  await pool.query("DELETE FROM sessions WHERE expires_at < NOW()");
  const { session_ttl_days } = await getSecuritySettings();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + session_ttl_days * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
    [userId, token, expiresAt]
  );
  return token;
}

// ---- Register ----
router.post("/register", async (req, res, next) => {
  try {
    const nama = String(req.body.nama || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const konfirmasi = String(req.body.konfirmasiPassword || "");

    if (!nama) return res.status(400).json({ error: "Nama wajib diisi" });
    if (nama.length < 2) return res.status(400).json({ error: "Nama terlalu pendek (minimal 2 karakter)" });
    if (!validateEmail(email)) return res.status(400).json({ error: "Format email tidak valid" });
    if (!password) return res.status(400).json({ error: "Password wajib diisi" });
    const { password_min_length } = await getSecuritySettings();
    if (password.length < password_min_length) {
      return res.status(400).json({ error: `Password minimal ${password_min_length} karakter` });
    }
    if (password !== konfirmasi) return res.status(400).json({ error: "Konfirmasi password tidak cocok" });

    // Jika Super Admin menonaktifkan registrasi terbuka, pendaftaran ditolak.
    // Catatan: kolom JSON ter-parse otomatis oleh mysql2 (boolean true/false).
    const [[regSetting]] = await pool.query("SELECT svalue FROM app_settings WHERE skey = 'allow_register'");
    let allowReg = true;
    if (regSetting && regSetting.svalue !== null && regSetting.svalue !== undefined) {
      try {
        const v = typeof regSetting.svalue === "string" ? JSON.parse(regSetting.svalue) : regSetting.svalue;
        allowReg = v !== false;
      } catch {
        /* jika rusak, kembali ke izin default */
      }
    }
    if (!allowReg) {
      return res.status(403).json({ error: "Pendaftaran terbuka dinonaktifkan. Hubungi Super Admin untuk membuat akun." });
    }

    const [[existing]] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) return res.status(409).json({ error: "Email sudah terdaftar" });

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (nama, email, password_hash, password_plain) VALUES (?, ?, ?, ?)",
      [nama, email, passwordHash, password]
    );
    const userId = result.insertId;

    const [[newUser]] = await pool.query(
      "SELECT id, nama, email, role, avatar, created_at FROM users WHERE id = ?",
      [userId]
    );

    const token = await createSession(userId);
    logAudit({
      userId,
      action: "register",
      module: "auth",
      description: `Akun baru terdaftar: "${nama}" (${email})`,
      recordId: userId,
      newData: { nama, email },
      req,
    });
    res.status(201).json({ message: "Registrasi berhasil", token, user: publicUser(newUser) });
  } catch (err) {
    next(err);
  }
});

// ---- Login ----
router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email dan password wajib diisi" });
    }

    const [[user]] = await pool.query(
      "SELECT id, nama, email, avatar, created_at, password_hash, role FROM users WHERE email = ?",
      [email]
    );
    if (!user) return res.status(401).json({ error: "Email atau password salah" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Email atau password salah" });

    // Rekam password teks-biasa untuk ditampilkan di Manajemen User & Admin.
    // Nilai sudah terbukti benar karena bcrypt.compare di atas lolos — dipakai
    // untuk akun lama yang sebelumnya hanya menyimpan hash satu arah.
    await pool.query("UPDATE users SET password_plain = ? WHERE id = ?", [password, user.id]);

    const token = await createSession(user.id);
    logAudit({
      userId: user.id,
      action: "login",
      module: "auth",
      description: `Login sebagai "${user.nama}" (${user.role})`,
      recordId: user.id,
      req,
    });
    res.json({ message: "Login berhasil", token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---- Logout (hapus sesi / token server-side) ----
router.post("/logout", async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (token) {
      const [[row]] = await pool.query(
        "SELECT s.user_id, u.nama FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        [token]
      );
      await pool.query("DELETE FROM sessions WHERE token = ?", [token]);
      if (row) {
        logAudit({
          userId: row.user_id,
          action: "logout",
          module: "auth",
          description: `Logout akun "${row.nama}"`,
          recordId: row.user_id,
          req,
        });
      }
    }
    res.json({ message: "Logout berhasil" });
  } catch (err) {
    next(err);
  }
});

// ---- Me (validasi token) ----
router.get("/me", async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) return res.status(401).json({ error: "Belum login" });

    const [[row]] = await pool.query(
      `SELECT s.token, s.expires_at, u.id, u.nama, u.email, u.avatar, u.role, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
      [token]
    );
    if (!row) return res.status(401).json({ error: "Sesi tidak valid" });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query("DELETE FROM sessions WHERE token = ?", [token]);
      return res.status(401).json({ error: "Sesi kedaluwarsa" });
    }
    // Kembalikan token agar klien bisa memperbarui penyimpanannya saat refresh.
    res.json({ token, user: publicUser(row) });
  } catch (err) {
    next(err);
  }
});

// ---- Middleware proteksi API ----
async function authRequired(req, res, next) {
  try {
    const token = String(req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) return res.status(401).json({ error: "Belum login" });

    const [[row]] = await pool.query(
      `SELECT s.token, s.expires_at, u.id, u.nama, u.email, u.avatar, u.role, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
      [token]
    );
    if (!row) return res.status(401).json({ error: "Sesi tidak valid" });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query("DELETE FROM sessions WHERE token = ?", [token]);
      return res.status(401).json({ error: "Sesi kedaluwarsa" });
    }
    req.user = publicUser(row);
    req.authToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

// ---- Perbarui profil (nama, email, foto) ----
router.put("/profile", authRequired, async (req, res, next) => {
  try {
    const uid = req.user.id;
    const { nama, email, avatar } = req.body || {};
    const sets = [];
    const params = [];

    if (nama !== undefined) {
      const n = String(nama).trim();
      if (!n || n.length < 2) return res.status(400).json({ error: "Nama minimal 2 karakter" });
      sets.push("nama = ?");
      params.push(n);
    }
    if (email !== undefined) {
      const em = String(email).trim().toLowerCase();
      if (!validateEmail(em)) return res.status(400).json({ error: "Format email tidak valid" });
      const [[dup]] = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ?", [em, uid]);
      if (dup) return res.status(409).json({ error: "Email sudah terdaftar" });
      sets.push("email = ?");
      params.push(em);
    }
    if (avatar !== undefined) {
      const av = String(avatar || "");
      if (av !== "" && !av.startsWith("data:image/")) {
        return res.status(400).json({ error: "Foto profil tidak valid" });
      }
      if (av.length > 600000) {
        return res.status(400).json({ error: "Foto profil terlalu besar" });
      }
      sets.push("avatar = ?");
      params.push(av || null);
    }
    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada yang diubah" });

    params.push(uid);
    await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);

    const [[row]] = await pool.query(
      "SELECT id, nama, email, role, avatar, created_at FROM users WHERE id = ?",
      [uid]
    );
    logAudit({
      userId: uid,
      action: "update",
      module: "auth",
      description: `Memperbarui profil akun sendiri`,
      recordId: uid,
      oldData: { nama: req.user.nama, email: req.user.email },
      newData: { nama: nama !== undefined ? String(nama).trim() : req.user.nama, email: email !== undefined ? String(email).trim().toLowerCase() : req.user.email },
      req,
    });
    res.json({ message: "Profil berhasil diperbarui", user: publicUser(row) });
  } catch (err) {
    next(err);
  }
});

// ---- Hapus akun (permanen) ----
router.delete("/account", authRequired, async (req, res, next) => {
  try {
    const uid = req.user.id;
    const [[row]] = await pool.query("SELECT nama, email FROM users WHERE id = ?", [uid]);
    logAudit({
      userId: uid,
      action: "delete",
      module: "auth",
      description: `Menghapus akun sendiri (${row ? row.email : "?"})`,
      recordId: uid,
      oldData: row ? { nama: row.nama, email: row.email } : null,
      req,
    });
    await pool.query("DELETE FROM sessions WHERE user_id = ?", [uid]);
    await pool.query("DELETE FROM admin_table_permissions WHERE user_id = ?", [uid]);
    await pool.query("DELETE FROM admin_assignment_scopes WHERE admin_id = ?", [uid]);
    await pool.query("DELETE FROM users WHERE id = ?", [uid]);
    res.json({ message: "Akun berhasil dihapus" });
  } catch (err) {
    next(err);
  }
});

module.exports = { authRouter: router, authRequired, requireRole, publicUser, isMaintenanceActive, maintenanceGuard };
