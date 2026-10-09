// =====================================================================
// Kolaborasi multi-user Fase 1 (backend):
//  - Hak akses file per workbook (tabel file_shares) + kompatibilitas
//    dengan sistem penugasan lama (admin_table_permissions / scopes).
//  - Operasi sel granular dengan optimistic locking (kolom versi).
//  - Revisi snapshot per sheet (banding & pulihkan).
// Pemetaan peran: super_admin = Admin, admin = Editor, user = Viewer.
// =====================================================================
const express = require("express");
const { pool } = require("./db");
const { requireRole } = require("./auth");
const { logAudit } = require("./auditLog");

// Pemeriksa izin tulis tingkat baris (diinjeksikan server.js agar memakai
// aturan granular sheet yang sudah ada: scope LOCK + kolom/baris izin).
// Signature: async (user, row) => { ok: true } | { ok: false, reason }
let rowWriteChecker = null;
function setRowWriteChecker(fn) {
  rowWriteChecker = fn;
}

// ---- Identitas workbook ----
// workbook_key = spreadsheet.sumber_file; untuk sheet lama tanpa
// sumber_file dipakai kunci deterministik "sheet#<id>".
async function resolveWorkbookKey({ sheetId = null, workbookKey = null } = {}) {
  if (workbookKey) return String(workbookKey);
  if (sheetId) {
    const [[sh]] = await pool.query(
      "SELECT id, sumber_file FROM spreadsheet WHERE id = ?",
      [Number(sheetId)]
    );
    if (!sh) return null;
    return sh.sumber_file || `sheet#${sh.id}`;
  }
  return null;
}

async function sheetIdsOfWorkbook(workbookKey) {
  if (/^sheet#(\d+)$/.test(String(workbookKey))) {
    return [Number(String(workbookKey).slice(6))];
  }
  const [rows] = await pool.query(
    "SELECT id FROM spreadsheet WHERE sumber_file = ?",
    [String(workbookKey)]
  );
  return rows.map((r) => r.id);
}

// ---- Akses tingkat workbook ----
// Kembalian: { read, write, level: 'admin'|'editor'|'viewer'|null, via }
async function getWorkbookAccess(user, workbookKey) {
  if (!user || !workbookKey) return { read: false, write: false, level: null, via: null };
  if (user.role === "super_admin") {
    return { read: true, write: true, level: "admin", via: "role" };
  }
  const [[share]] = await pool.query(
    "SELECT peran FROM file_shares WHERE workbook_key = ? AND user_id = ?",
    [String(workbookKey), user.id]
  );
  if (share) {
    return share.peran === "editor"
      ? { read: true, write: true, level: "editor", via: "share" }
      : { read: true, write: false, level: "viewer", via: "share" };
  }
  // Kompatibilitas: penugasan lama tetap berlaku untuk role admin.
  if (user.role === "admin") {
    const ids = await sheetIdsOfWorkbook(workbookKey);
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      const [[row]] = await pool.query(
        `SELECT
           SUM(can_entry = 1 OR can_edit = 1) AS bisa,
           COUNT(*) AS ada
         FROM admin_table_permissions
         WHERE user_id = ? AND tipe = 'spreadsheet' AND tabel_id IN (${ph})`,
        [user.id, ...ids]
      );
      if (row && Number(row.bisa) > 0) {
        return { read: true, write: true, level: "editor", via: "assignment" };
      }
      if (row && Number(row.ada) > 0) {
        return { read: true, write: false, level: "viewer", via: "assignment" };
      }
      const [scopes] = await pool.query(
        "SELECT id FROM admin_assignment_scopes WHERE admin_id = ? AND (workbook_key = ? OR sheet_id IN (" + ph + ")) LIMIT 1",
        [user.id, String(workbookKey), ...ids]
      );
      if (scopes.length) {
        return { read: true, write: false, level: "viewer", via: "scope" };
      }
    }
  }
  return { read: false, write: false, level: null, via: null };
}

// ---- Validasi & koersi nilai sel ----
const EDITABLE_STANDARD = new Set([
  "kode", "nama", "kategori_id", "sub_kategori_id",
  "jumlah", "harga", "tanggal", "status", "keterangan",
]);
const LOCKED_KEYS = new Set(["total", "formulas", "id", "sheet_id", "versi"]);

function coerceCellValue(colKey, value) {
  if (colKey === "jumlah") {
    const n = Number(String(value ?? "").replace(/[Rp\s.]/g, "").replace(",", "."));
    if (!Number.isFinite(n)) throw new Error("Jumlah harus berupa angka");
    return Math.max(0, Math.min(Math.round(n), 9007199254740991));
  }
  if (colKey === "harga") {
    const n = Number(String(value ?? "").replace(/[Rp\s.]/g, "").replace(",", "."));
    if (!Number.isFinite(n)) throw new Error("Harga harus berupa angka");
    return Math.min(Math.max(n, 0), 9999999999999.99);
  }
  if (colKey === "tanggal") {
    const s = String(value ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
      throw new Error("Tanggal harus format YYYY-MM-DD");
    }
    return s;
  }
  if (colKey === "status") {
    const s = String(value ?? "").trim();
    if (!["Masuk", "Keluar", "Pending"].includes(s)) throw new Error("Status tidak valid");
    return s;
  }
  if (colKey === "kode") {
    const s = String(value ?? "").trim().slice(0, 50);
    if (!s) throw new Error("Kode wajib diisi");
    return s;
  }
  if (colKey === "nama") {
    const s = String(value ?? "").trim().slice(0, 150);
    if (!s) throw new Error("Nama wajib diisi");
    return s;
  }
  if (colKey === "kategori_id" || colKey === "sub_kategori_id") {
    if (value === null || value === "" || value === undefined) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new Error("Referensi kategori tidak valid");
    return n;
  }
  if (colKey === "keterangan") {
    const s = String(value ?? "").trim();
    return s ? s.slice(0, 1000) : null;
  }
  // Kolom kustom (kimportN): teks bebas.
  return String(value ?? "").slice(0, 2000);
}

function parseJsonField(v) {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v || null;
}

// Format tanggal DB (objek Date dari mysql2 maupun string) ke YYYY-MM-DD.
// String(Date) seperti "Fri Oct 09 ..." TIDAK boleh di-slice langsung.
function fmtTanggal(d) {
  if (!d) return null;
  if (d instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// Terapkan satu operasi sel dalam koneksi (transaksi dikelola pemanggil).
// Kembalian: { ok, row } | { conflict, current } | { error, status }
async function applyCellOp(conn, { user, rowId, colKey, value, baseVersi = null }) {
  const key = String(colKey || "").trim();
  if (!key || LOCKED_KEYS.has(key)) {
    return { error: "Kolom terkunci (hasil hitungan/rumus) tidak bisa diubah", status: 400 };
  }
  const isStandard = EDITABLE_STANDARD.has(key);
  const isCustom = /^kimport\d+$/i.test(key);
  if (!isStandard && !isCustom) {
    return { error: `Kolom "${key}" tidak dikenal`, status: 400 };
  }

  const [[row]] = await conn.query(
    "SELECT * FROM data_barang WHERE id = ? FOR UPDATE",
    [rowId]
  );
  if (!row) return { error: "Baris data tidak ditemukan", status: 404 };

  // Izin tulis tingkat workbook (share/role/assignment).
  // Baris tanpa sheet (data kategori biasa) hanya boleh diubah Admin utama
  // lewat jalur ini; kolaborasi file menyasar baris ber-sheet.
  const wbKey = await resolveWorkbookKey({ sheetId: row.sheet_id });
  if (!wbKey) {
    if (user.role !== "super_admin") {
      return { error: "Baris ini bukan bagian dari file kolaborasi", status: 403 };
    }
  } else {
    const access = await getWorkbookAccess(user, wbKey);
    if (!access || !access.write) {
      return { error: "Anda tidak memiliki izin mengedit file ini", status: 403 };
    }
  }
  // Aturan granular sheet (khusus role admin: kunci rumus & cakupan).
  if (user.role === "admin") {
    const curFm = parseJsonField(row.formulas) || {};
    if (curFm[key]) {
      return { error: "Cell berisi rumus (formula) terkunci dan tidak boleh diedit", status: 403 };
    }
    if (rowWriteChecker) {
      const chk = await rowWriteChecker(user, row, [key]);
      if (!chk.ok) return { error: chk.reason || "Tidak ada izin pada bagian/kolom baris ini", status: 403 };
    }
  }
  // Rumus hanya boleh diubah super_admin (konsisten dengan PUT /api/data).
  if (user.role !== "super_admin" && typeof value === "string" && value.startsWith("=")) {
    return { error: "Rumus (formula) tidak boleh diubah selain oleh Admin utama", status: 403 };
  }

  let coerced;
  try {
    coerced = coerceCellValue(key, value);
  } catch (e) {
    return { error: e.message, status: 400 };
  }

  const currentVersi = Number(row.versi) || 1;
  if (baseVersi !== null && baseVersi !== undefined && Number(baseVersi) !== currentVersi) {
    return { conflict: true, current: publicRow(row) };
  }

  const oldVal = isStandard ? row[key] : (parseJsonField(row.nilai) || {})[key] ?? "";
  let newNilaiJson = row.nilai;
  const sets = ["versi = versi + 1", "updated_by = ?"];
  const params = [user.id];
  if (isStandard) {
    sets.push(`\`${key}\` = ?`);
    params.push(coerced);
  } else {
    const obj = parseJsonField(row.nilai) || {};
    obj[key] = coerced;
    newNilaiJson = JSON.stringify(obj);
    sets.push("nilai = ?");
    params.push(newNilaiJson);
  }
  params.push(rowId, currentVersi);
  const [upd] = await conn.query(
    `UPDATE data_barang SET ${sets.join(", ")} WHERE id = ? AND versi = ?`,
    params
  );
  if (upd.affectedRows === 0) {
    const [[fresh]] = await conn.query("SELECT * FROM data_barang WHERE id = ?", [rowId]);
    return { conflict: true, current: fresh ? publicRow(fresh) : null };
  }
  const [[fresh]] = await conn.query("SELECT * FROM data_barang WHERE id = ?", [rowId]);

  logAudit({
    userId: user.id,
    action: "edit",
    module: "collab",
    description: `Mengubah sel ${key} pada "${row.nama}" (${row.kode})`,
    recordId: rowId,
    oldData: { kolom: key, nilai: oldVal ?? null, versi: currentVersi },
    newData: { kolom: key, nilai: coerced, versi: currentVersi + 1 },
  });

  return { ok: true, row: publicRow(fresh) };
}

function publicRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    kode: r.kode,
    nama: r.nama,
    kategori_id: r.kategori_id,
    sub_kategori_id: r.sub_kategori_id,
    sheet_id: r.sheet_id,
    jumlah: r.jumlah !== undefined ? Number(r.jumlah) : r.jumlah,
    harga: r.harga !== undefined ? Number(r.harga) : r.harga,
    tanggal: fmtTanggal(r.tanggal),
    status: r.status,
    keterangan: r.keterangan,
    nilai: parseJsonField(r.nilai),
    versi: Number(r.versi) || 1,
    updated_by: r.updated_by || null,
  };
}

// ---- Router REST ----
function createCollabRouter() {
  const router = express.Router();

  // Akses efektif saya terhadap sebuah file.
  router.get("/files/:key/access", async (req, res, next) => {
    try {
      const access = await getWorkbookAccess(req.user, req.params.key);
      res.json({ workbook_key: req.params.key, ...access });
    } catch (err) {
      next(err);
    }
  });

  // Daftar pengguna yang memiliki akses file.
  router.get("/files/:key/shares", async (req, res, next) => {
    try {
      const access = await getWorkbookAccess(req.user, req.params.key);
      if (!access.read) return res.status(403).json({ error: "Anda tidak memiliki akses ke file ini" });
      const [rows] = await pool.query(
        `SELECT s.user_id, s.peran, s.created_at, u.nama, u.email, u.role, u.avatar
         FROM file_shares s JOIN users u ON u.id = s.user_id
         WHERE s.workbook_key = ? ORDER BY u.nama ASC`,
        [String(req.params.key)]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // Berikan akses (khusus Admin utama).
  router.post("/files/:key/shares", requireRole("super_admin"), async (req, res, next) => {
    try {
      const { user_id, email, peran } = req.body || {};
      if (!["viewer", "editor"].includes(peran)) {
        return res.status(400).json({ error: "Peran harus viewer atau editor" });
      }
      let uid = user_id ? Number(user_id) : null;
      if (!uid && email) {
        const [[u]] = await pool.query("SELECT id FROM users WHERE email = ?", [String(email).trim().toLowerCase()]);
        if (!u) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
        uid = u.id;
      }
      if (!uid) return res.status(400).json({ error: "user_id atau email wajib diisi" });
      await pool.query(
        `INSERT INTO file_shares (workbook_key, user_id, peran, created_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE peran = VALUES(peran)`,
        [String(req.params.key), uid, peran, req.user.id]
      );
      logAudit({
        userId: req.user.id, action: "share", module: "share",
        description: `Memberi akses ${peran} file "${req.params.key}" ke user #${uid}`,
        newData: { workbook_key: req.params.key, user_id: uid, peran }, req,
      });
      res.status(201).json({ message: "Akses berhasil diberikan" });
    } catch (err) {
      next(err);
    }
  });

  // Ubah peran akses (khusus Admin utama).
  router.put("/files/:key/shares/:userId", requireRole("super_admin"), async (req, res, next) => {
    try {
      const { peran } = req.body || {};
      if (!["viewer", "editor"].includes(peran)) {
        return res.status(400).json({ error: "Peran harus viewer atau editor" });
      }
      const [r] = await pool.query(
        "UPDATE file_shares SET peran = ? WHERE workbook_key = ? AND user_id = ?",
        [peran, String(req.params.key), Number(req.params.userId)]
      );
      if (r.affectedRows === 0) return res.status(404).json({ error: "Data akses tidak ditemukan" });
      logAudit({
        userId: req.user.id, action: "share", module: "share",
        description: `Mengubah akses file "${req.params.key}" user #${req.params.userId} menjadi ${peran}`,
        newData: { workbook_key: req.params.key, user_id: Number(req.params.userId), peran }, req,
      });
      res.json({ message: "Hak akses berhasil diubah" });
    } catch (err) {
      next(err);
    }
  });

  // Cabut akses (khusus Admin utama).
  router.delete("/files/:key/shares/:userId", requireRole("super_admin"), async (req, res, next) => {
    try {
      const [r] = await pool.query(
        "DELETE FROM file_shares WHERE workbook_key = ? AND user_id = ?",
        [String(req.params.key), Number(req.params.userId)]
      );
      if (r.affectedRows === 0) return res.status(404).json({ error: "Data akses tidak ditemukan" });
      logAudit({
        userId: req.user.id, action: "unshare", module: "share",
        description: `Mencabut akses file "${req.params.key}" user #${req.params.userId}`,
        recordId: Number(req.params.userId),
        newData: { workbook_key: req.params.key, user_id: Number(req.params.userId) }, req,
      });
      res.json({ message: "Akses berhasil dicabut" });
    } catch (err) {
      next(err);
    }
  });

  // Tulis satu sel (dengan optimistic locking via base_versi).
  router.put("/cells", async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const { row_id, col_key, value, base_versi } = req.body || {};
      const out = await applyCellOp(conn, {
        user: req.user,
        rowId: Number(row_id),
        colKey: col_key,
        value,
        baseVersi: base_versi === undefined ? null : Number(base_versi),
      });
      if (out.error) {
        await conn.rollback();
        return res.status(out.status || 400).json({ error: out.error });
      }
      if (out.conflict) {
        await conn.rollback();
        return res.status(409).json({ error: "Data sudah diubah pengguna lain. Muat ulang sebelum menyimpan.", current: out.current });
      }
      await conn.commit();
      res.json({ message: "Tersimpan", row: out.row });
    } catch (err) {
      try {
        await conn.rollback();
      } catch { /* abaikan */ }
      next(err);
    } finally {
      conn.release();
    }
  });

  // Tulis banyak sel sekaligus (autosave batch). Diurutkan per row_id
  // untuk menghindari deadlock; satu transaksi agar konsisten.
  router.put("/cells/batch", async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      const ops = Array.isArray(req.body && req.body.ops) ? req.body.ops : [];
      if (!ops.length || ops.length > 200) {
        return res.status(400).json({ error: "Jumlah operasi harus 1–200" });
      }
      const sorted = [...ops].sort((a, b) => Number(a.row_id) - Number(b.row_id));
      await conn.beginTransaction();
      const results = [];
      for (const op of sorted) {
        const out = await applyCellOp(conn, {
          user: req.user,
          rowId: Number(op.row_id),
          colKey: op.col_key,
          value: op.value,
          baseVersi: op.base_versi === undefined ? null : Number(op.base_versi),
        });
        results.push({
          op_id: op.op_id || null,
          row_id: Number(op.row_id),
          col_key: op.col_key,
          ...(out.ok ? { saved: true, row: out.row } : {}),
          ...(out.conflict ? { conflict: true, current: out.current } : {}),
          ...(out.error ? { error: out.error, status: out.status } : {}),
        });
      }
      await conn.commit();
      res.json({ results });
    } catch (err) {
      try {
        await conn.rollback();
      } catch { /* abaikan */ }
      next(err);
    } finally {
      conn.release();
    }
  });

  // Buat revisi snapshot sebuah sheet (butuh akses tulis).
  router.post("/sheets/:id/revisions", async (req, res, next) => {
    try {
      const sheetId = Number(req.params.id);
      const [[sh]] = await pool.query("SELECT id, sumber_file FROM spreadsheet WHERE id = ?", [sheetId]);
      if (!sh) return res.status(404).json({ error: "Sheet tidak ditemukan" });
      const wbKey = sh.sumber_file || `sheet#${sh.id}`;
      const access = await getWorkbookAccess(req.user, wbKey);
      if (!access.write) return res.status(403).json({ error: "Anda tidak memiliki izin menyimpan revisi file ini" });
      const [rows] = await pool.query(
        `SELECT id, kode, nama, kategori_id, sub_kategori_id, jumlah, harga, tanggal, status,
                keterangan, formulas, nilai, versi, updated_by
         FROM data_barang WHERE sheet_id = ? ORDER BY id ASC`,
        [sheetId]
      );
      const [[mx]] = await pool.query(
        "SELECT COALESCE(MAX(versi_no),0) AS m FROM sheet_revisions WHERE sheet_id = ?",
        [sheetId]
      );
      const versiNo = Number(mx.m) + 1;
      const [r] = await pool.query(
        "INSERT INTO sheet_revisions (sheet_id, versi_no, data, jumlah_baris, created_by) VALUES (?, ?, ?, ?, ?)",
        [sheetId, versiNo, JSON.stringify(rows.map((x) => ({ ...x, tanggal: fmtTanggal(x.tanggal) }))), rows.length, req.user.id]
      );
      logAudit({
        userId: req.user.id, action: "create", module: "collab",
        description: `Menyimpan revisi v${versiNo} sheet #${sheetId} (${rows.length} baris)`,
        recordId: r.insertId, newData: { sheet_id: sheetId, versi_no: versiNo, rows: rows.length }, req,
      });
      res.status(201).json({ id: r.insertId, versi_no: versiNo, rows: rows.length });
    } catch (err) {
      next(err);
    }
  });

  // Daftar revisi sebuah sheet (butuh akses baca).
  router.get("/sheets/:id/revisions", async (req, res, next) => {
    try {
      const sheetId = Number(req.params.id);
      const [[sh]] = await pool.query("SELECT id, sumber_file FROM spreadsheet WHERE id = ?", [sheetId]);
      if (!sh) return res.status(404).json({ error: "Sheet tidak ditemukan" });
      const access = await getWorkbookAccess(req.user, sh.sumber_file || `sheet#${sh.id}`);
      if (!access.read) return res.status(403).json({ error: "Anda tidak memiliki akses ke file ini" });
      const [rows] = await pool.query(
        `SELECT r.id, r.sheet_id, r.versi_no, r.jumlah_baris, r.created_by, r.created_at, u.nama AS dibuat_oleh
         FROM sheet_revisions r LEFT JOIN users u ON u.id = r.created_by
         WHERE r.sheet_id = ? ORDER BY r.versi_no DESC LIMIT 100`,
        [sheetId]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // Isi satu revisi (untuk perbandingan).
  router.get("/revisions/:revId", async (req, res, next) => {
    try {
      const [[rev]] = await pool.query(
        `SELECT r.*, u.nama AS dibuat_oleh FROM sheet_revisions r
         LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`,
        [Number(req.params.revId)]
      );
      if (!rev) return res.status(404).json({ error: "Revisi tidak ditemukan" });
      const [[sh]] = await pool.query("SELECT id, sumber_file FROM spreadsheet WHERE id = ?", [rev.sheet_id]);
      const access = await getWorkbookAccess(req.user, sh ? (sh.sumber_file || `sheet#${sh.id}`) : null);
      if (!access.read) return res.status(403).json({ error: "Anda tidak memiliki akses ke file ini" });
      rev.data = typeof rev.data === "string" ? JSON.parse(rev.data) : rev.data;
      res.json(rev);
    } catch (err) {
      next(err);
    }
  });

  // Pulihkan sheet ke sebuah revisi (butuh akses tulis + peran admin/super_admin).
  // Keadaan berjalan diamankan dulu sebagai revisi baru sebelum diganti.
  router.post("/revisions/:revId/pulihkan", requireRole("admin", "super_admin"), async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      const [[rev]] = await conn.query("SELECT * FROM sheet_revisions WHERE id = ?", [Number(req.params.revId)]);
      if (!rev) return res.status(404).json({ error: "Revisi tidak ditemukan" });
      const [[sh]] = await conn.query("SELECT id, sumber_file FROM spreadsheet WHERE id = ?", [rev.sheet_id]);
      if (!sh) return res.status(404).json({ error: "Sheet tidak ditemukan" });
      const access = await getWorkbookAccess(req.user, sh.sumber_file || `sheet#${sh.id}`);
      if (!access.write) {
        return res.status(403).json({ error: "Anda tidak memiliki izin memulihkan file ini" });
      }
      const snap = typeof rev.data === "string" ? JSON.parse(rev.data) : rev.data;
      await conn.beginTransaction();
      const [cur] = await conn.query(
        "SELECT id, kode, nama, kategori_id, sub_kategori_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai, versi, updated_by FROM data_barang WHERE sheet_id = ? ORDER BY id ASC",
        [sh.id]
      );
      const [[mx]] = await conn.query("SELECT COALESCE(MAX(versi_no),0) AS m FROM sheet_revisions WHERE sheet_id = ?", [sh.id]);
      await conn.query(
        "INSERT INTO sheet_revisions (sheet_id, versi_no, data, jumlah_baris, created_by) VALUES (?, ?, ?, ?, ?)",
        [sh.id, Number(mx.m) + 1, JSON.stringify(cur.map((x) => ({ ...x, tanggal: fmtTanggal(x.tanggal) }))), cur.length, req.user.id]
      );
      await conn.query("DELETE FROM data_barang WHERE sheet_id = ?", [sh.id]);
      for (const r of snap || []) {
        await conn.query(
          `INSERT INTO data_barang (id, kode, nama, kategori_id, sub_kategori_id, sheet_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai, versi, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id || null, r.kode, r.nama, r.kategori_id || null, r.sub_kategori_id || null, sh.id,
            r.jumlah ?? 0, r.harga ?? 0,
            r.tanggal ? String(r.tanggal).slice(0, 10) : new Date().toISOString().slice(0, 10),
            r.status || "Pending", r.keterangan || null,
            r.formulas ? (typeof r.formulas === "string" ? r.formulas : JSON.stringify(r.formulas)) : null,
            r.nilai ? (typeof r.nilai === "string" ? r.nilai : JSON.stringify(r.nilai)) : null,
            r.versi || 1, req.user.id,
          ]
        );
      }
      await conn.commit();
      logAudit({
        userId: req.user.id, action: "restore", module: "collab",
        description: `Memulihkan sheet #${sh.id} ke revisi v${rev.versi_no} (${(snap || []).length} baris)`,
        recordId: rev.id, newData: { sheet_id: sh.id, revisi: rev.versi_no, rows: (snap || []).length }, req,
      });
      res.json({ message: "Sheet berhasil dipulihkan", rows: (snap || []).length });
    } catch (err) {
      try {
        await conn.rollback();
      } catch { /* abaikan */ }
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Kode duplikat — pemulihan dibatalkan, data tidak berubah" });
      }
      next(err);
    } finally {
      conn.release();
    }
  });

  return router;
}

module.exports = {
  createCollabRouter,
  getWorkbookAccess,
  resolveWorkbookKey,
  applyCellOp,
  setRowWriteChecker,
};
