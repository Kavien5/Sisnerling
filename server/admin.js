const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { requireRole } = require("./auth");
const { logAudit } = require("./auditLog");
const { getSecuritySettings, saveSecuritySettings, LIMITS: SECURITY_LIMITS } = require("./securitySettings");

const router = express.Router();

// Seluruh route di sini dikunci: hanya Super Admin.
router.use(requireRole("super_admin"));

const ROLES = ["user", "admin", "super_admin"];

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

// ===== Manajemen User & Admin =====

router.get("/users", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.nama, u.email, u.role, u.avatar, u.password_plain, u.created_at,
              (SELECT COUNT(*) FROM admin_table_permissions p WHERE p.user_id = u.id) AS jumlah_tugas
       FROM users u
       ORDER BY u.id ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/users", async (req, res, next) => {
  try {
    const nama = String(req.body.nama || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = ROLES.includes(req.body.role) ? req.body.role : "user";

    if (!nama || nama.length < 2) return res.status(400).json({ error: "Nama minimal 2 karakter" });
    if (!validateEmail(email)) return res.status(400).json({ error: "Format email tidak valid" });
    const { password_min_length } = await getSecuritySettings();
    if (!password || password.length < password_min_length) {
      return res.status(400).json({ error: `Password minimal ${password_min_length} karakter` });
    }
    const [[dup]] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (dup) return res.status(409).json({ error: "Email sudah terdaftar" });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (nama, email, password_hash, password_plain, role) VALUES (?, ?, ?, ?, ?)",
      [nama, email, hash, password, role]
    );
    logAudit({
      userId: req.user.id,
      action: "create",
      module: "user",
      description: `Membuat akun "${nama}" (${email}) dengan peran ${role}`,
      recordId: result.insertId,
      newData: { nama, email, role, password_diset: !!password },
      req,
    });
    res.status(201).json({ id: result.insertId, message: "Pengguna berhasil dibuat" });
  } catch (err) {
    next(err);
  }
});

router.put("/users/:id", async (req, res, next) => {
  try {
    const uid = Number(req.params.id);
    const [[user]] = await pool.query("SELECT id, nama, email, role FROM users WHERE id = ?", [uid]);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan" });

    const sets = [];
    const params = [];

    if (req.body.nama !== undefined) {
      const n = String(req.body.nama).trim();
      if (!n || n.length < 2) return res.status(400).json({ error: "Nama minimal 2 karakter" });
      sets.push("nama = ?");
      params.push(n);
    }
    if (req.body.email !== undefined) {
      const em = String(req.body.email).trim().toLowerCase();
      if (!validateEmail(em)) return res.status(400).json({ error: "Format email tidak valid" });
      const [[dupe]] = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ?", [em, uid]);
      if (dupe) return res.status(409).json({ error: "Email sudah terdaftar" });
      sets.push("email = ?");
      params.push(em);
    }
    if (req.body.password !== undefined && String(req.body.password) !== "") {
      const pw = String(req.body.password);
      const { password_min_length } = await getSecuritySettings();
      if (pw.length < password_min_length) {
        return res.status(400).json({ error: `Password minimal ${password_min_length} karakter` });
      }
      const hash = await bcrypt.hash(pw, 10);
      sets.push("password_hash = ?");
      params.push(hash);
      sets.push("password_plain = ?");
      params.push(pw);
    }
    if (req.body.role !== undefined) {
      const role = req.body.role;
      if (!ROLES.includes(role)) return res.status(400).json({ error: "Role tidak valid" });
      // Jangan biarkan Super Admin menurunkan dirinya sendiri.
      if (uid === req.user.id && role !== "super_admin") {
        return res.status(400).json({ error: "Anda tidak dapat menurunkan role pada diri sendiri" });
      }
      // Pastikan minimal satu Super Admin tetap ada.
      if (user.role === "super_admin" && role !== "super_admin") {
        const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'");
        if (Number(n) <= 1) {
          return res.status(400).json({ error: "Minimal harus ada satu Super Admin" });
        }
      }
      sets.push("role = ?");
      params.push(role);
    }
    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada yang diubah" });

    params.push(uid);
    await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "user",
      description: `Memperbarui akun "${user.nama}" (${user.email})`,
      recordId: uid,
      oldData: { nama: user.nama, email: user.email, role: user.role },
      newData: {
        nama: req.body.nama !== undefined ? String(req.body.nama).trim() : user.nama,
        email: req.body.email !== undefined ? String(req.body.email).trim().toLowerCase() : user.email,
        role: req.body.role !== undefined ? req.body.role : user.role,
        password_diganti: !!req.body.password,
      },
      req,
    });
    res.json({ message: "Pengguna berhasil diperbarui" });
  } catch (err) {
    next(err);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    const uid = Number(req.params.id);
    if (uid === req.user.id) {
      return res.status(400).json({ error: "Anda tidak dapat menghapus akun sendiri" });
    }
    const [[user]] = await pool.query("SELECT id, nama, email, role FROM users WHERE id = ?", [uid]);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    if (user.role === "super_admin") {
      const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'");
      if (Number(n) <= 1) {
        return res.status(400).json({ error: "Minimal harus ada satu Super Admin" });
      }
    }
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "user",
      description: `Menghapus akun "${user.nama}" (${user.email})`,
      recordId: uid,
      oldData: { nama: user.nama, email: user.email, role: user.role },
      req,
    });
    await pool.query("DELETE FROM sessions WHERE user_id = ?", [uid]);
    await pool.query("DELETE FROM admin_table_permissions WHERE user_id = ?", [uid]);
    await pool.query("DELETE FROM admin_assignment_scopes WHERE admin_id = ?", [uid]);
    await pool.query("DELETE FROM users WHERE id = ?", [uid]);
    res.json({ message: "Pengguna berhasil dihapus" });
  } catch (err) {
    next(err);
  }
});

// ===== Penugasan Tabel untuk Admin (entry/edit data) =====

async function tableExists(tipe, tabelId) {
  const tableName = tipe === "spreadsheet" ? "spreadsheet" : "kategori";
  const [[row]] = await pool.query(`SELECT id FROM \`${tableName}\` WHERE id = ?`, [tabelId]);
  return !!row;
}

// Validasi section agar memang milik sheet yang ditugaskan.
async function resolveSection(sectionId, tipe, tabelId) {
  if (sectionId === null || sectionId === undefined || sectionId === "") return { sectionId: null };
  const sid = Number(sectionId);
  if (!sid) return { error: "Sub-tabel tidak valid" };
  const [[sec]] = await pool.query("SELECT id, sheet_id FROM spreadsheet_sections WHERE id = ?", [sid]);
  if (!sec) return { error: "Sub-tabel/bagian tidak ditemukan" };
  if (tipe !== "spreadsheet" || Number(sec.sheet_id) !== Number(tabelId)) {
    return { error: "Sub-tabel tidak sesuai dengan tabel tujuan" };
  }
  return { sectionId: sid };
}

// kolomIzin: null/[] = semua kolom boleh; array kunci kolom = hanya kolom itu.
function buildKolomJson(v) {
  if (v === undefined || v === null || v === "") return null;
  let arr = v;
  if (typeof v === "string") {
    try { arr = JSON.parse(v); } catch { return null; }
  }
  if (!Array.isArray(arr)) return null;
  const keys = arr.map((k) => String(k).trim()).filter(Boolean);
  return keys.length ? JSON.stringify(keys) : null;
}

// barisIzin: {awal,akhir} rentang 1-based, {rows:[1,3,5]} daftar baris yang boleh,
// atau {ranges:[{awal,akhir,kolom?}]} banyak rentang (masing-masing boleh membatasi kolom).
// null = semua baris.
function buildBarisJson(v, res) {
  if (v === undefined || v === null || v === "") return null;
  let obj = v;
  if (typeof v === "string") {
    try { obj = JSON.parse(v); } catch {
      if (res) res.status(400).json({ error: "Rentang baris tidak valid" });
      return undefined;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj.ranges)) {
    const normalize = (r) => {
      if (!r || typeof r !== "object") return null;
      const awal = r.awal === null || r.awal === undefined || r.awal === "" ? null : Number(r.awal);
      const akhir = r.akhir === null || r.akhir === undefined || r.akhir === "" ? null : Number(r.akhir);
      if ((awal !== null && Number.isNaN(awal)) || (akhir !== null && Number.isNaN(akhir))) {
        if (res) res.status(400).json({ error: "Rentang baris tidak valid" });
        return undefined;
      }
      if (awal !== null && akhir !== null && awal > akhir) {
        if (res) res.status(400).json({ error: "Rentang baris tidak valid (awal > akhir)" });
        return undefined;
      }
      if (awal === null && akhir === null) return null;
      const kolom = Array.isArray(r.kolom) && r.kolom.length
        ? r.kolom.map((k) => String(k).trim()).filter(Boolean)
        : null;
      return kolom && kolom.length ? { awal, akhir, kolom } : { awal, akhir };
    };
    const ranges = [];
    for (const r of obj.ranges) {
      const n = normalize(r);
      if (n === undefined) return undefined;
      if (n) ranges.push(n);
    }
    const locks = [];
    if (Array.isArray(obj.locks)) {
      for (const r of obj.locks) {
        const n = normalize(r);
        if (n === undefined) return undefined;
        if (n) locks.push(n);
      }
    }
    if (!ranges.length && !locks.length) return null;
    const out = { ranges };
    if (locks.length) out.locks = locks;
    return JSON.stringify(out);
  }
  if (Array.isArray(obj.rows)) {
    const rows = obj.rows.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1);
    if (rows.length) return JSON.stringify({ rows });
    return null;
  }
  const awal = obj.awal === null || obj.awal === undefined || obj.awal === "" ? null : Number(obj.awal);
  const akhir = obj.akhir === null || obj.akhir === undefined || obj.akhir === "" ? null : Number(obj.akhir);
  if ((awal !== null && Number.isNaN(awal)) || (akhir !== null && Number.isNaN(akhir))) {
    if (res) res.status(400).json({ error: "Rentang baris tidak valid" });
    return undefined;
  }
  if (awal !== null && akhir !== null && awal > akhir) {
    if (res) res.status(400).json({ error: "Rentang baris tidak valid (awal > akhir)" });
    return undefined;
  }
  if (awal === null && akhir === null) return null;
  return JSON.stringify({ awal, akhir });
}

router.get("/permissions", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.user_id, p.tipe, p.tabel_id, p.section_id, p.can_entry, p.can_edit,
              p.kolom_izin, p.baris_izin, p.asal, p.created_at,
              u.nama AS nama_user,
              CASE p.tipe
                WHEN 'kategori' THEN (SELECT k.nama_kategori FROM kategori k WHERE k.id = p.tabel_id)
                WHEN 'spreadsheet' THEN (SELECT sp.nama FROM spreadsheet sp WHERE sp.id = p.tabel_id)
              END AS nama_tabel,
              s.nama AS nama_section, s.baris_awal, s.baris_akhir, s.kolom AS section_kolom,
              (SELECT COUNT(*) FROM admin_assignment_scopes sc
                WHERE sc.admin_id = p.user_id AND sc.sheet_id = p.tabel_id) AS jumlah_aturan
       FROM admin_table_permissions p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN spreadsheet_sections s ON s.id = p.section_id
       ORDER BY p.id DESC`
    );
    // JSON kolom dikirim sebagai teks sehingga mudah ditampilkan di UI.
    const out = rows.map((r) => {
      let kolom_izin = r.kolom_izin;
      if (typeof kolom_izin === "string") { try { kolom_izin = JSON.parse(kolom_izin); } catch {} }
      let baris_izin = r.baris_izin;
      if (typeof baris_izin === "string") { try { baris_izin = JSON.parse(baris_izin); } catch {} }
      // Baris yang dibuat sistem scope tapi aturan induknya sudah dihapus => "sisa".
      return {
        ...r,
        kolom_izin,
        baris_izin,
        asal: r.asal || "manual",
        jumlah_aturan: Number(r.jumlah_aturan || 0),
        sisa: r.asal === "scope" && Number(r.jumlah_aturan || 0) === 0,
      };
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.post("/permissions", async (req, res, next) => {
  try {
    const userId = Number(req.body.userId);
    const tipe = req.body.tipe === "spreadsheet" ? "spreadsheet" : "kategori";
    const tabelId = Number(req.body.tabelId);
    if (!userId || !tabelId) {
      return res.status(400).json({ error: "User dan tabel wajib diisi" });
    }
    const [[user]] = await pool.query("SELECT id, role FROM users WHERE id = ?", [userId]);
    if (!user) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    if (user.role !== "admin") {
      return res.status(400).json({ error: "Penugasan tabel hanya untuk pengguna berperan Admin" });
    }
    if (!(await tableExists(tipe, tabelId))) {
      return res.status(404).json({ error: "Tabel/spreadsheet tidak ditemukan" });
    }
    const canEntry = req.body.canEntry !== false ? 1 : 0;
    const canEdit = req.body.canEdit !== false ? 1 : 0;

    // Izin granular: sectionId (sub-tabel), kolomIzin (array kunci kolom), barisIzin ({awal,akhir}).
    let sectionId = null;
    if (req.body.sectionId) {
      const r = await resolveSection(req.body.sectionId, tipe, tabelId);
      if (r.error) return res.status(400).json({ error: r.error });
      sectionId = r.sectionId;
    }
    const kolomJson = buildKolomJson(req.body.kolomIzin);
    const barisJson = buildBarisJson(req.body.barisIzin, res);
    if (barisJson === undefined) return;

    // Upsert manual: pada MySQL unik (user,tipe,tabel,section) memperlakukan NULL
    // sebagai nilai berbeda, sehingga ON DUPLICATE KEY tidak bisa dipakai untuk
    // penugasan seluruh tabel (section NULL).
    const [[existing]] = await pool.query(
      `SELECT id FROM admin_table_permissions
       WHERE user_id = ? AND tipe = ? AND tabel_id = ?
         AND ((? IS NULL AND section_id IS NULL) OR section_id = ?)
       LIMIT 1`,
      [userId, tipe, tabelId, sectionId, sectionId]
    );
    if (existing) {
      await pool.query(
        `UPDATE admin_table_permissions
         SET can_entry = ?, can_edit = ?, section_id = ?, kolom_izin = ?, baris_izin = ?
         WHERE id = ?`,
        [canEntry, canEdit, sectionId, kolomJson, barisJson, existing.id]
      );
    } else {
      await pool.query(
        `INSERT INTO admin_table_permissions (user_id, tipe, tabel_id, section_id, can_entry, can_edit, kolom_izin, baris_izin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, tipe, tabelId, sectionId, canEntry, canEdit, kolomJson, barisJson]
      );
    }
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "permission",
      description: `Menugaskan "${tipe}" ${sectionId ? `sub-tabel #${sectionId}` : `tabel #${tabelId}`} ke user #${userId} (entry:${canEntry ? "ya" : "tidak"}, edit:${canEdit ? "ya" : "tidak"})`,
      recordId: tabelId,
      newData: { userId, tipe, tabelId, sectionId, canEntry: !!canEntry, canEdit: !!canEdit, kolomJson, barisJson },
      req,
    });
    res.status(201).json({ message: "Penugasan berhasil disimpan" });
  } catch (err) {
    next(err);
  }
});

router.put("/permissions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[perm]] = await pool.query(
      "SELECT id, user_id, tipe, tabel_id, section_id FROM admin_table_permissions WHERE id = ?",
      [id]
    );
    if (!perm) return res.status(404).json({ error: "Penugasan tidak ditemukan" });

    const sets = [];
    const params = [];

    if (req.body.userId !== undefined) {
      const n = Number(req.body.userId);
      const [[u]] = await pool.query("SELECT id, role FROM users WHERE id = ?", [n]);
      if (!u || u.role !== "admin") return res.status(400).json({ error: "Admin tujuan tidak valid" });
      sets.push("user_id = ?");
      params.push(n);
    }
    if (req.body.canEntry !== undefined) {
      sets.push("can_entry = ?");
      params.push(req.body.canEntry !== false ? 1 : 0);
    }
    if (req.body.canEdit !== undefined) {
      sets.push("can_edit = ?");
      params.push(req.body.canEdit !== false ? 1 : 0);
    }
    if (req.body.sectionId !== undefined) {
      if (req.body.sectionId) {
        const r = await resolveSection(req.body.sectionId, perm.tipe, perm.tabel_id);
        if (r.error) return res.status(400).json({ error: r.error });
        sets.push("section_id = ?");
        params.push(r.sectionId);
      } else {
        sets.push("section_id = ?");
        params.push(null);
      }
    }
    if (req.body.kolomIzin !== undefined) {
      sets.push("kolom_izin = ?");
      params.push(buildKolomJson(req.body.kolomIzin));
    }
    if (req.body.barisIzin !== undefined) {
      const bj = buildBarisJson(req.body.barisIzin, res);
      if (bj === undefined) return;
      sets.push("baris_izin = ?");
      params.push(bj);
    }
    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada yang diubah" });

    params.push(id);
    await pool.query(`UPDATE admin_table_permissions SET ${sets.join(", ")} WHERE id = ?`, params);
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "permission",
      description: `Mengubah izin penugasan #${id} (entry & edit / cakupan kolom-baris)`,
      recordId: perm.tabel_id,
      newData: { permissionId: id, userId: perm.user_id, tipe: perm.tipe, tabelId: perm.tabel_id },
      req,
    });
    res.json({ message: "Penugasan berhasil diperbarui" });
  } catch (err) {
    next(err);
  }
});

router.delete("/permissions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[perm]] = await pool.query("SELECT id, user_id, tipe, tabel_id FROM admin_table_permissions WHERE id = ?", [id]);
    if (!perm) return res.status(404).json({ error: "Penugasan tidak ditemukan" });
    const [result] = await pool.query("DELETE FROM admin_table_permissions WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Penugasan tidak ditemukan" });
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "permission",
      description: `Menghapus penugasan izin #${id}`,
      recordId: perm.tabel_id,
      oldData: { permissionId: id, userId: perm.user_id, tipe: perm.tipe, tabelId: perm.tabel_id },
      req,
    });
    res.json({ message: "Penugasan berhasil dihapus" });
  } catch (err) {
    next(err);
  }
});

// ===== Penugasan berbasis Cakupan (workbook / sheet / kolom / baris / range / cell) =====
//
// Menyimpan ATURAN LOCK/UNLOCK saja (referensi), bukan data. Workbook & sheet
// memakai baris `spreadsheet` yang ASLI (satu baris satu worksheet asli), jadi
// tidak pernah membuat sheet duplikat. Setiap Admin tetap mengedit data sumber
// yang sama; aturan ini hanya membatasi siapa boleh mengetik di bagian mana.

const { LEVELS, toRule, rangeLabel, workbookAliases } = require("./assignmentScopes");

const numOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

// Baris spreadsheet ASLI untuk satu worksheet pada workbook tertentu.
// Nama file dari browser bisa Ber-extension (.xlsx) - dinormalisasi dulu.
async function findOriginalSheet({ workbookKey, sheetName, sheetId }) {
  if (sheetId) {
    const [[byId]] = await pool.query("SELECT * FROM spreadsheet WHERE id = ?", [Number(sheetId)]);
    if (byId) return byId;
  }
  const cands = workbookAliases(workbookKey);
  if (!cands.length) return null;
  const [rows] = await pool.query(
    `SELECT * FROM spreadsheet
      WHERE LOWER(COALESCE(sumber_file, '')) IN (?)
         OR LOWER(nama) IN (?)
         OR LOWER(nama) LIKE CONCAT(?, '%@')
      ORDER BY id ASC`,
    [cands, cands, cands[0]]
  );
  const want = String(sheetName || "").trim().toLowerCase();
  if (!want) return rows[0] || null;
  const label = (r) => {
    const n = String(r.nama || "");
    return (n.includes("@") ? n.slice(n.lastIndexOf("@") + 1) : n).trim().toLowerCase();
  };
  return rows.find((r) => label(r) === want)
    || rows.find((r) => label(r).includes(want) || want.includes(label(r)))
    || rows[0]
    || null;
}

// Daftar aturan (dengan nama admin) - hanya Super Admin.
router.get("/scopes", async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.adminId) { where.push("a.admin_id = ?"); params.push(Number(req.query.adminId)); }
    if (req.query.sheetId) { where.push("a.sheet_id = ?"); params.push(Number(req.query.sheetId)); }
    const [rows] = await pool.query(
      `SELECT a.*, u.nama AS nama_admin, u.email AS email_admin
       FROM admin_assignment_scopes a
       JOIN users u ON u.id = a.admin_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY a.admin_id ASC, a.workbook_key ASC, a.sheet_id ASC, a.id ASC`,
      params
    );
    res.json(rows.map((r) => {
      const rule = toRule(r);
      return { ...rule, colKeys: rule.colKeys, nama_admin: r.nama_admin, email_admin: r.email_admin, label: rangeLabel(rule) };
    }));
  } catch (err) {
    next(err);
  }
});

// Simpan satu aturan penugasan.
router.post("/scopes", async (req, res, next) => {
  try {
    const adminId = Number(req.body.adminId);
    const level = String(req.body.level || "");
    if (!adminId) return res.status(400).json({ error: "Admin wajib dipilih" });
    if (!LEVELS.includes(level)) return res.status(400).json({ error: "Cakupan tidak valid" });
    const [[admin]] = await pool.query("SELECT id, role FROM users WHERE id = ?", [adminId]);
    if (!admin) return res.status(404).json({ error: "Admin tidak ditemukan" });
    if (admin.role !== "admin") return res.status(400).json({ error: "Penugasan hanya untuk role Admin" });

    const workbookKey = String(req.body.workbookKey || "").trim();
    const workbookName = String(req.body.workbookName || workbookKey).trim();
    if (!workbookKey) return res.status(400).json({ error: "File/Workbook wajib dipilih" });

    // Sheet: wajib untuk semua level selain workbook; ID-nya selalu baris
    // spreadsheet ASLI hasil pencocokan (bukan input bebas dari client).
    let sheetRow = null;
    if (level !== "workbook") {
      sheetRow = await findOriginalSheet({
        workbookKey,
        sheetName: req.body.sheetName,
        sheetId: req.body.sheetId,
      });
      if (!sheetRow) return res.status(404).json({ error: "Sheet asli tidak ditemukan pada workbook tersebut" });
    }

    const r1 = numOrNull(req.body.r1);
    const c1 = numOrNull(req.body.c1);
    const r2 = numOrNull(req.body.r2);
    const c2 = numOrNull(req.body.c2);
    if (["row", "range", "cell"].includes(level) && (r1 == null || r1 < 0)) {
      return res.status(400).json({ error: "Baris tidak valid" });
    }
    if (["range", "cell"].includes(level) && (c1 == null || c1 < 0)) {
      return res.status(400).json({ error: "Kolom tidak valid" });
    }
    let colKeys = null;
    if (level === "column") {
      colKeys = (Array.isArray(req.body.colKeys) ? req.body.colKeys : []).map(String).filter(Boolean);
      if (!colKeys.length) return res.status(400).json({ error: "Pilih minimal satu kolom" });
    }

    const status = req.body.status === "unlock" ? "unlock" : "lock";
    const canEntry = req.body.canEntry === false || req.body.canEntry === 0 ? 0 : 1;
    const canEdit = req.body.canEdit === false || req.body.canEdit === 0 ? 0 : 1;

    // Normalisasi range (r1<=r2, c1<=c2).
    const norm = r1 != null && r2 != null
      ? { r1: Math.min(r1, r2), r2: Math.max(r1, r2) }
      : { r1, r2 };
    const normC = c1 != null && c2 != null
      ? { c1: Math.min(c1, c2), c2: Math.max(c1, c2) }
      : { c1, c2 };

    // Satu aturan per AREA: jika sudah ada aturan untuk kombinasi yang sama
    // maka status/izin-nya DI-UPDATE (upsert), bukan ditambah baris baru.
    // Tanpa ini, Unlock pada area yang sudah terkunci akan membuat baris
    // "unlock" kedua yang kalah dari baris "lock" lama (tie-break id terkecil).
    const colKeysJson = colKeys ? JSON.stringify(colKeys) : null;
    const [existing] = await pool.query(
      `SELECT id FROM admin_assignment_scopes
        WHERE admin_id = ? AND workbook_key = ? AND sheet_id <=> ? AND level = ?
          AND r1 <=> ? AND c1 <=> ? AND r2 <=> ? AND c2 <=> ?
          AND ((col_keys IS NULL AND ? IS NULL) OR col_keys = ?)
        ORDER BY id ASC LIMIT 1`,
      [
        adminId, workbookKey, sheetRow ? sheetRow.id : null, level,
        norm.r1, normC.c1, norm.r2, normC.c2,
        colKeysJson, colKeysJson,
      ]
    );

    let result;
    if (existing.length) {
      await pool.query(
        "UPDATE admin_assignment_scopes SET status = ?, can_entry = ?, can_edit = ? WHERE id = ?",
        [status, canEntry, canEdit, existing[0].id]
      );
      result = { insertId: existing[0].id };
    } else {
      [result] = await pool.query(
        `INSERT INTO admin_assignment_scopes
          (admin_id, workbook_key, workbook_name, sheet_id, sheet_name, level,
           r1, c1, r2, c2, col_keys, status, can_entry, can_edit)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          adminId, workbookKey, workbookName,
          sheetRow ? sheetRow.id : null,
          sheetRow ? String(sheetRow.nama).split("@").pop() : null,
          level,
          norm.r1, normC.c1, norm.r2, normC.c2,
          colKeysJson,
          status, canEntry, canEdit,
        ]
      );
    }

    // Cerminkan aturan ke tabel izin lama (admin_table_permissions) agar
    // endpoint /api/data* lama ikut terlindungi. Baris izin yang sudah ada
    // TIDAK diubah - aturan cakupan menjadi lapis kedua di atasnya.
    if (sheetRow) {
      const [ex] = await pool.query(
        `SELECT id FROM admin_table_permissions
          WHERE user_id = ? AND tipe = 'spreadsheet' AND tabel_id = ? AND section_id IS NULL LIMIT 1`,
        [adminId, sheetRow.id]
      );
      if (!ex.length) {
        await pool.query(
          `INSERT INTO admin_table_permissions (user_id, tipe, tabel_id, section_id, can_entry, can_edit, asal)
           VALUES (?, 'spreadsheet', ?, NULL, ?, ?, 'scope')`,
          [adminId, sheetRow.id, canEntry, canEdit]
        );
      }
    }

    res.json({ message: "Penugasan disimpan", id: result.insertId });
  } catch (err) {
    next(err);
  }
});

router.put("/scopes/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[row]] = await pool.query("SELECT * FROM admin_assignment_scopes WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "Aturan tidak ditemukan" });
    const status = req.body.status === "unlock" ? "unlock" : row.status === "unlock" ? "unlock" : "lock";
    const canEntry = req.body.canEntry === false || req.body.canEntry === 0 ? 0 : 1;
    const canEdit = req.body.canEdit === false || req.body.canEdit === 0 ? 0 : 1;
    await pool.query(
      "UPDATE admin_assignment_scopes SET status = ?, can_entry = ?, can_edit = ? WHERE id = ?",
      [status, canEntry, canEdit, id]
    );
    res.json({ message: "Aturan diperbarui" });
  } catch (err) {
    next(err);
  }
});

router.delete("/scopes/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM admin_assignment_scopes WHERE id = ?", [Number(req.params.id)]);
    res.json({ message: "Aturan dihapus" });
  } catch (err) {
    next(err);
  }
});

// ===== Sub-Tabel / Bagian (spreadsheet_sections) =====

router.get("/sections", async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.sheetId) {
      where.push("s.sheet_id = ?");
      params.push(Number(req.query.sheetId));
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT s.id, s.sheet_id, s.nama, s.deskripsi, s.baris_awal, s.baris_akhir, s.kolom, s.urutan, s.created_at,
              sp.nama AS nama_sheet,
              (SELECT COUNT(*) FROM data_barang d WHERE d.sheet_id = s.sheet_id) AS jumlah_baris_sheet
       FROM spreadsheet_sections s
       JOIN spreadsheet sp ON sp.id = s.sheet_id
       ${whereSql}
       ORDER BY sp.id ASC, s.urutan ASC, s.id ASC`,
      params
    );
    res.json(rows.map((r) => {
      let kolom = r.kolom;
      if (typeof kolom === "string") { try { kolom = JSON.parse(kolom); } catch {} }
      return { ...r, kolom };
    }));
  } catch (err) {
    next(err);
  }
});

router.post("/sections", async (req, res, next) => {
  try {
    const sheetId = Number(req.body.sheetId);
    const nama = String(req.body.nama || "").trim();
    const deskripsi = req.body.deskripsi ? String(req.body.deskripsi).trim() : null;
    if (!sheetId) return res.status(400).json({ error: "Spreadsheet wajib diisi" });
    if (!nama || nama.length < 2) return res.status(400).json({ error: "Nama bagian minimal 2 karakter" });
    const [[sp]] = await pool.query("SELECT id FROM spreadsheet WHERE id = ?", [sheetId]);
    if (!sp) return res.status(404).json({ error: "Spreadsheet tidak ditemukan" });

    const kolomArr = buildKolomJson(req.body.kolom);
    const barisObj = req.body.barisIzin !== undefined ? buildBarisJson(req.body.barisIzin, res) : undefined;
    if (barisObj === undefined && req.body.barisIzin !== undefined) return;
    const barisAwal = req.body.barisAwal !== undefined && req.body.barisAwal !== "" ? Number(req.body.barisAwal) : null;
    const barisAkhir = req.body.barisAkhir !== undefined && req.body.barisAkhir !== "" ? Number(req.body.barisAkhir) : null;
    if ((barisAwal !== null && Number.isNaN(barisAwal)) || (barisAkhir !== null && Number.isNaN(barisAkhir))) {
      return res.status(400).json({ error: "Rentang baris tidak valid" });
    }
    if (barisAwal !== null && barisAkhir !== null && barisAwal > barisAkhir) {
      return res.status(400).json({ error: "Rentang baris tidak valid (awal > akhir)" });
    }
    const urutan = req.body.urutan !== undefined && req.body.urutan !== "" ? Number(req.body.urutan) : 0;

    const [result] = await pool.query(
      `INSERT INTO spreadsheet_sections (sheet_id, nama, deskripsi, baris_awal, baris_akhir, kolom, urutan)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sheetId, nama, deskripsi, barisAwal, barisAkhir, kolomArr, Number.isNaN(urutan) ? 0 : urutan]
    );
    logAudit({
      userId: req.user.id,
      action: "create",
      module: "section",
      description: `Membuat sub-tabel "${nama}" pada sheet #${sheetId}`,
      recordId: result.insertId,
      newData: { sheetId, nama, barisAwal, barisAkhir, kolom: kolomArr },
      req,
    });
    res.status(201).json({ id: result.insertId, message: "Sub-tabel berhasil dibuat" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Nama sub-tabel sudah dipakai pada spreadsheet ini" });
    }
    next(err);
  }
});

router.put("/sections/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[sec]] = await pool.query("SELECT * FROM spreadsheet_sections WHERE id = ?", [id]);
    if (!sec) return res.status(404).json({ error: "Sub-tabel tidak ditemukan" });

    const sets = [];
    const params = [];
    if (req.body.nama !== undefined) {
      const nama = String(req.body.nama).trim();
      if (!nama || nama.length < 2) return res.status(400).json({ error: "Nama bagian minimal 2 karakter" });
      sets.push("nama = ?");
      params.push(nama);
    }
    if (req.body.deskripsi !== undefined) {
      sets.push("deskripsi = ?");
      params.push(req.body.deskripsi ? String(req.body.deskripsi).trim() : null);
    }
    if (req.body.kolom !== undefined) {
      sets.push("kolom = ?");
      params.push(buildKolomJson(req.body.kolom));
    }
    if (req.body.barisAwal !== undefined || req.body.barisAkhir !== undefined) {
      const awal = req.body.barisAwal !== undefined && req.body.barisAwal !== "" ? Number(req.body.barisAwal) : (sec.baris_awal != null ? Number(sec.baris_awal) : null);
      const akhir = req.body.barisAkhir !== undefined && req.body.barisAkhir !== "" ? Number(req.body.barisAkhir) : (sec.baris_akhir != null ? Number(sec.baris_akhir) : null);
      if ((awal !== null && Number.isNaN(awal)) || (akhir !== null && Number.isNaN(akhir))) {
        return res.status(400).json({ error: "Rentang baris tidak valid" });
      }
      if (awal !== null && akhir !== null && awal > akhir) {
        return res.status(400).json({ error: "Rentang baris tidak valid (awal > akhir)" });
      }
      sets.push("baris_awal = ?", "baris_akhir = ?");
      params.push(awal, akhir);
    }
    if (req.body.urutan !== undefined && req.body.urutan !== "") {
      sets.push("urutan = ?");
      params.push(Number(req.body.urutan) || 0);
    }
    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada yang diubah" });

    params.push(id);
    await pool.query(`UPDATE spreadsheet_sections SET ${sets.join(", ")} WHERE id = ?`, params);
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "section",
      description: `Memperbarui sub-tabel #${id}`,
      recordId: id,
      newData: { sectionId: id },
      req,
    });
    res.json({ message: "Sub-tabel berhasil diperbarui" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Nama sub-tabel sudah dipakai pada spreadsheet ini" });
    }
    next(err);
  }
});

router.delete("/sections/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[sec]] = await pool.query("SELECT id, nama, sheet_id FROM spreadsheet_sections WHERE id = ?", [id]);
    if (!sec) return res.status(404).json({ error: "Sub-tabel tidak ditemukan" });
    // Bagian bersifat VIEW — baris data pada sheet TIDAK dihapus.
    // Lepaskan penugasan admin yang menunjuk bagian ini.
    await pool.query("UPDATE admin_table_permissions SET section_id = NULL WHERE section_id = ?", [id]);
    await pool.query("DELETE FROM spreadsheet_sections WHERE id = ?", [id]);
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "section",
      description: `Menghapus sub-tabel "${sec.nama}" (data sheet tetap aman)`,
      recordId: id,
      oldData: { id, nama: sec.nama, sheet_id: sec.sheet_id },
      req,
    });
    res.json({ message: "Sub-tabel berhasil dihapus. Data sheet tidak terpengaruh." });
  } catch (err) {
    next(err);
  }
});

// ===== Maintenance Mode =====

router.get("/maintenance", async (_req, res, next) => {
  try {
    const [[row]] = await pool.query("SELECT svalue FROM app_settings WHERE skey = 'maintenance'");
    let cfg = {};
    if (row && row.svalue) {
      try { cfg = typeof row.svalue === "string" ? JSON.parse(row.svalue) : row.svalue; } catch {}
    }
    res.json({
      active: !!cfg.active,
      title: cfg.title || "Maintenance",
      message: cfg.message || "",
      start_at: cfg.start_at || null,
      end_at: cfg.end_at || null,
    });
  } catch (err) {
    next(err);
  }
});

router.put("/maintenance", async (req, res, next) => {
  try {
    // Gabungkan dengan konfigurasi yang sudah ada agar field yang tidak dikirim
    // tidak tertimpa default.
    const [[cur]] = await pool.query("SELECT svalue FROM app_settings WHERE skey = 'maintenance'");
    let prev = {};
    if (cur && cur.svalue) {
      try { prev = typeof cur.svalue === "string" ? JSON.parse(cur.svalue) : cur.svalue; } catch {}
    }
    const active = req.body.active !== undefined ? !!req.body.active : !!prev.active;
    const title = req.body.title !== undefined ? String(req.body.title).trim() : (prev.title || "Maintenance");
    const message = req.body.message !== undefined ? String(req.body.message).trim() : (prev.message || "");
    const start_at = req.body.start_at !== undefined ? (req.body.start_at || null) : (prev.start_at || null);
    const end_at = req.body.end_at !== undefined ? (req.body.end_at || null) : (prev.end_at || null);
    const cfg = { active, title, message, start_at, end_at };
    await pool.query(
      `INSERT INTO app_settings (skey, svalue) VALUES ('maintenance', ?)
       ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
      [JSON.stringify(cfg)]
    );
    logAudit({
      userId: req.user.id,
      action: active ? "update" : "update",
      module: "maintenance",
      description: active ? "Mengaktifkan mode maintenance" : "Menonaktifkan mode maintenance",
      oldData: { active: !!prev.active, title: prev.title || "", end_at: prev.end_at || null },
      newData: cfg,
      req,
    });
    res.json({ message: active ? "Maintenance diaktifkan" : "Maintenance dinonaktifkan", ...cfg });
  } catch (err) {
    next(err);
  }
});

// ===== Pengaturan umum =====

router.get("/settings", async (_req, res, next) => {
  try {
    const [[allowReg]] = await pool.query("SELECT svalue FROM app_settings WHERE skey = 'allow_register'");
    let allowRegister = true;
    if (allowReg && allowReg.svalue) {
      try { allowRegister = (typeof allowReg.svalue === "string" ? JSON.parse(allowReg.svalue) : allowReg.svalue) !== false; } catch {}
    }
    const security = await getSecuritySettings();
    res.json({ allow_register: allowRegister, ...security });
  } catch (err) {
    next(err);
  }
});

router.put("/settings", async (req, res, next) => {
  try {
    const allowRegister = req.body.allow_register !== false;
    await pool.query(
      `INSERT INTO app_settings (skey, svalue) VALUES ('allow_register', ?)
       ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
      [JSON.stringify(allowRegister)]
    );
    // Keamanan & Sesi (opsional): validasi rentang sebelum disimpan.
    const sec = {};
    if (req.body.session_ttl_days !== undefined) {
      const lim = SECURITY_LIMITS.session_ttl_days;
      const n = Number(req.body.session_ttl_days);
      if (!Number.isInteger(n) || n < lim.min || n > lim.max) {
        return res.status(400).json({ error: `Durasi sesi harus ${lim.min}–${lim.max} hari` });
      }
      sec.session_ttl_days = n;
    }
    if (req.body.password_min_length !== undefined) {
      const lim = SECURITY_LIMITS.password_min_length;
      const n = Number(req.body.password_min_length);
      if (!Number.isInteger(n) || n < lim.min || n > lim.max) {
        return res.status(400).json({ error: `Panjang password minimal harus ${lim.min}–${lim.max} karakter` });
      }
      sec.password_min_length = n;
    }
    const security = await saveSecuritySettings(sec);
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "settings",
      description: allowRegister ? "Mengizinkan pendaftaran terbuka" : "Menonaktifkan pendaftaran terbuka",
      newData: { allow_register: allowRegister, ...security },
      req,
    });
    res.json({ message: "Pengaturan berhasil disimpan", allow_register: allowRegister, ...security });
  } catch (err) {
    next(err);
  }
});

// ===== Backup / Restore =====

const EXCLUDED_TABLES = ["sessions", "backups"];

async function listAppTables() {
  const [rows] = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`
  );
  return rows.map((r) => r.table_name || r.TABLE_NAME).filter((t) => !EXCLUDED_TABLES.includes(t));
}

router.get("/backups", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.nama, b.ukuran, b.created_at, u.nama AS dibuat_oleh
       FROM backups b LEFT JOIN users u ON u.id = b.dibuat_oleh
       ORDER BY b.id DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/backups", async (req, res, next) => {
  try {
    const tables = await listAppTables();
    const dump = {};
    for (const t of tables) {
      const [rows] = await pool.query(`SELECT * FROM \`${t}\``);
      dump[t] = rows;
    }
    const payload = JSON.stringify({ version: 1, dibuat: new Date().toISOString(), tables: dump });
    const ukuran = Buffer.byteLength(payload, "utf8");
    if (ukuran > 12000000) {
      return res.status(413).json({ error: "Ukuran backup terlalu besar untuk disimpan di database" });
    }
    const nama = String(req.body.nama || "").trim() || `Backup ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    const [result] = await pool.query(
      "INSERT INTO backups (nama, isi, ukuran, dibuat_oleh) VALUES (?, ?, ?, ?)",
      [nama, payload, ukuran, req.user.id]
    );
    logAudit({
      userId: req.user.id,
      action: "create",
      module: "backup",
      description: `Membuat backup "${nama}" (${Object.keys(dump).length} tabel, ${Math.round(ukuran / 1024)} KB)`,
      recordId: result.insertId,
      newData: { nama, ukuran, tables: Object.keys(dump) },
      req,
    });
    res.status(201).json({
      id: result.insertId,
      nama,
      ukuran,
      message: `Backup berhasil dibuat (${Object.keys(dump).length} tabel)`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/backups/:id", async (req, res, next) => {
  try {
    const [[row]] = await pool.query("SELECT * FROM backups WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Backup tidak ditemukan" });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${String(row.nama).replace(/[^a-zA-Z0-9 _.-]/g, "_")}.json"`);
    res.send(row.isi);
  } catch (err) {
    next(err);
  }
});

router.delete("/backups/:id", async (req, res, next) => {
  try {
    const [[old]] = await pool.query("SELECT id, nama FROM backups WHERE id = ?", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Backup tidak ditemukan" });
    const [result] = await pool.query("DELETE FROM backups WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Backup tidak ditemukan" });
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "backup",
      description: `Menghapus backup "${old.nama}"`,
      recordId: req.params.id,
      oldData: { nama: old.nama },
      req,
    });
    res.json({ message: "Backup berhasil dihapus" });
  } catch (err) {
    next(err);
  }
});

// Restore = MERGE (upsert). Tidak ada aksi DROP/TRUNCATE/DELETE sehingga data
// yang tidak ada di dalam backup tetap aman.
router.post("/backups/:id/restore", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const [[row]] = await pool.query("SELECT * FROM backups WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Backup tidak ditemukan" });
    if (!row.isi) return res.status(400).json({ error: "Isi backup kosong" });

    const parsed = JSON.parse(row.isi);
    const tables = parsed && parsed.tables ? parsed.tables : {};
    const existing = await listAppTables();
    const report = {};

    await conn.beginTransaction();
    for (const [t, rows] of Object.entries(tables)) {
      if (!existing.includes(t) || !Array.isArray(rows) || rows.length === 0) continue;
      const [meta] = await conn.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [t]
      );
      const colsMeta = [];
      meta.forEach((m) => {
        colsMeta.push({
          name: m.column_name || m.COLUMN_NAME,
          type: String(m.data_type || m.DATA_TYPE || "").toLowerCase(),
        });
      });
      if (colsMeta.length === 0) continue;
      const cols = colsMeta.map((c) => c.name);

      // Normalisasi nilai datetime: '2026-01-01T10:00:00.000Z' → '2026-01-01 10:00:00'.
      const normalize = (c, val) => {
        if (val === null || val === undefined) return null;
        const type = c.type;
        // Kolom JSON: mysql2 mengembalikan objek ter-parse, serahkan sebagai teks JSON.
        if (type === "json" && (typeof val === "object" || Array.isArray(val))) {
          return JSON.stringify(val);
        }
        if (typeof val !== "string") return val;
        const isDateTime = type.includes("datetime") || type.includes("timestamp");
        const isDate = type === "date";
        if (!isDateTime && !isDate) return val;
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?/.exec(val);
        if (!m) return val;
        return `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5]}:${m[6]}` : ""}`;
      };

      let restored = 0;
      // Batch 500 baris per kueri.
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500).filter((r) => r && typeof r === "object");
        if (batch.length === 0) continue;
        const colList = cols.join(", ");
        // Kolom JSON di-CAST agar selalu valid; sisanya parameter biasa.
        const valueExprs = colsMeta.map((c) => (c.type === "json" ? "CAST(? AS JSON)" : "?"));
        const placeholders = batch
          .map(() => `(${valueExprs.join(", ")})`)
          .join(", ");
        const updateParts = colsMeta.map((c) => `\`${c.name}\` = VALUES(\`${c.name}\`)`).join(", ");
        const values = [];
        for (const r of batch) {
          for (const c of colsMeta) values.push(normalize(c, r[c.name]));
        }
        await conn.query(
          `INSERT INTO \`${t}\` (${colList}) VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE ${updateParts}`,
          values
        );
        restored += batch.length;
      }
      report[t] = restored;
    }

    await conn.commit();
    logAudit({
      userId: req.user.id,
      action: "restore",
      module: "backup",
      description: `Meng-restore backup "${row.nama}" (${Object.keys(report).length} tabel)`,
      recordId: row.id,
      newData: { nama: row.nama, report },
      req,
    });
    res.json({ message: "Restore selesai (merging, data tidak dihapus)", report });
  } catch (err) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ error: "Gagal restore", detail: err.message });
  } finally {
    conn.release();
  }
});

module.exports = { adminRouter: router };