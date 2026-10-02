const { pool } = require("./db");

// Nilai JSON dari database (mysql2 sudah meng-parse kolom JSON). Jika masih
// berupa string, normalkan agar old_data/new_data selalu objek.
function normalizeJson(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

// Ambil metadata jaringan dari request (IP + User-Agent) untuk disimpan.
// Aman dipanggil meski req tidak tersedia (misal dari cron/task).
function captureReqInfo(req) {
  if (!req) return { ipAddress: null, userAgent: null };
  let ip = null;
  const fwd = req.headers && req.headers["x-forwarded-for"];
  if (fwd) {
    ip = String(fwd).split(",")[0].trim();
  } else if (req.socket) {
    ip = String(req.socket.remoteAddress || "").trim();
  }
  const ua = req.headers && req.headers["user-agent"];
  return {
    ipAddress: ip ? ip.slice(0, 45) : null,
    userAgent: String(ua || "").slice(0, 300) || null,
  };
}

// Format ringkas untuk deskripsi otomatis bila tidak dikirim.
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

/**
 * Catat aktivitas penting ke tabel audit_logs. Seluruh kegagalan logging
 * ditelan (tidak menggagalkan operasi utama).
 *
 * @param {object} opts
 * @param {number|null} opts.userId
 * @param {string} opts.action        import|edit|delete|clean|create|update|export|restore|... 
 * @param {string|null} opts.module   spreadsheet|import|kategori|export|data|user|system|...
 * @param {string} opts.description
 * @param {number|null} opts.recordId
 * @param {object|null} opts.oldData
 * @param {object|null} opts.newData
 * @param {object|null} opts.req      (opsional) untuk menangkap IP + User-Agent
 */
async function logAudit({ userId, action, module = "system", description, recordId = null, oldData = null, newData = null, req = null }) {
  try {
    const { ipAddress, userAgent } = captureReqInfo(req);
    const desc =
      String(description || ACTION_LABELS[action] || action || "Aktivitas").slice(0, 500);
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, action, description, module, record_id, old_data, new_data, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        String(action || "unknown").slice(0, 50),
        desc,
        String(module || "system").slice(0, 50),
        recordId !== null && recordId !== undefined ? recordId : null,
        oldData === null || oldData === undefined ? null : JSON.stringify(oldData),
        newData === null || newData === undefined ? null : JSON.stringify(newData),
        ipAddress,
        userAgent,
      ]
    );
  } catch (err) {
    console.error("[AUDIT] gagal mencatat log:", err && err.message ? err.message : err);
  }
}

module.exports = { logAudit, normalizeJson, captureReqInfo };