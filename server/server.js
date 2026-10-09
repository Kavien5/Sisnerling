require("dotenv").config();
const express = require("express");
const cors = require("cors");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { pool, initDatabase } = require("./db");
const { authRouter, authRequired, requireRole, maintenanceGuard, isMaintenanceActive } = require("./auth");
const { adminRouter } = require("./admin");
const { auditRouter } = require("./audit");
const { logAudit } = require("./auditLog");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const path = require("path");
const publicDir = path.join(__dirname, "public");
// Aset ber-hash (index-*.js/css) aman di-cache lama; index.html jangan pernah
// di-cache agar perubahan bundle selalu terdeteksi oleh browser.
app.use(
  express.static(publicDir, {
    maxAge: "1y",
    immutable: true,
    setHeaders: (res, fp) => {
      if (fp.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => {
  if (!d) return "";
  if (d instanceof Date) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return String(d).slice(0, 10);
};
const fmtRp = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fmtNum = (n) => new Intl.NumberFormat("id-ID").format(Number(n) || 0);

function buildDataFilter(query) {
  const where = [];
  const params = [];
  const q = (query.q || "").trim();
  if (q) {
    where.push("(d.kode LIKE ? OR d.nama LIKE ? OR d.keterangan LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (query.kategoriId) {
    where.push("d.kategori_id = ?");
    params.push(query.kategoriId);
  }
  if (query.subKategoriId) {
    where.push("d.sub_kategori_id = ?");
    params.push(query.subKategoriId);
  }
  if (query.status) {
    const statuses = [].concat(query.status)
      .flatMap((s) => String(s).split(","))
      .map((s) => s.trim())
      .filter(Boolean);
    if (statuses.length === 1) {
      where.push("d.status = ?");
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      where.push("d.status IN (?)");
      params.push(statuses);
    }
  }
  if (query.from) {
    where.push("d.tanggal >= ?");
    params.push(query.from);
  }
  if (query.to) {
    where.push("d.tanggal <= ?");
    params.push(query.to);
  }
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "API SISNERLING aktif", time: new Date() });
});

// Status publik (tanpa login): dipakai klien untuk menampilkan halaman
// maintenance di layar login/register sekalipun.
app.get("/api/status", async (_req, res, next) => {
  try {
    const maintenance = await isMaintenanceActive();
    res.json({ status: "ok", maintenance });
  } catch (err) {
    next(err);
  }
});

// ===== Autentikasi (Login / Register / Logout) =====
// Route auth bersifat publik. Semua route /api lain di bawahnya dilindungi
// middleware authRequired sehingga hanya user yang sudah login yang bisa
// mengakses Dashboard serta data internal.
app.use("/api/auth", authRouter);
app.use("/api", authRequired);
// Gerbang maintenance: user & admin diblokir API saat maintenance; super_admin bebas.
app.use("/api", maintenanceGuard);
// Panel Super Admin (semua route di dalamnya sudah dikunci requireRole super_admin).
app.use("/api/admin", adminRouter);
// Audit log: dibaca Admin & Super Admin, route dalam sudah punya guard role.
app.use("/api/audit", auditRouter);
// Kolaborasi multi-user (akses file, sel real-time, revisi). Berada di bawah
// authRequired + maintenanceGuard sehingga otomatis terlindungi.
const { createCollabRouter, setRowWriteChecker } = require("./collab");
app.use("/api/collab", createCollabRouter());

// ===== Sambutan Dashboard (dapat diedit oleh Super Admin) =====
// Judul & deskripsi kartu "Selamat Datang" disimpan di app_settings.
const DEFAULT_GREETING = {
  title: "Selamat Datang di SISNERLING",
  description:
    "Sistem ini digunakan untuk mengolah data input\u2013output secara terpusat. Anda dapat memasukkan atau mengimpor data spreadsheet, mengelolanya berdasarkan kategori (Hutan, Mineral, Energi, Uang, dan lainnya), lalu memantau statistik dan progres seluruh data melalui Dashboard ini.",
};

app.get("/api/dashboard/greeting", async (_req, res, next) => {
  try {
    const [[row]] = await pool.query(
      "SELECT svalue FROM app_settings WHERE skey = 'dashboard_greeting'"
    );
    let greeting = DEFAULT_GREETING;
    if (row && row.svalue) {
      try {
        const v = typeof row.svalue === "string" ? JSON.parse(row.svalue) : row.svalue;
        if (v && typeof v === "object") {
          greeting = {
            title: String(v.title || DEFAULT_GREETING.title),
            description: String(v.description || DEFAULT_GREETING.description),
          };
        }
      } catch {
        /* pakai default bila rusak */
      }
    }
    res.json(greeting);
  } catch (err) {
    next(err);
  }
});

app.put("/api/dashboard/greeting", requireRole("super_admin"), async (req, res, next) => {
  try {
    const title = String((req.body && req.body.title) || "").trim();
    const description = String((req.body && req.body.description) || "").trim();
    if (!title) return res.status(400).json({ error: "Judul sambutan wajib diisi" });
    const greeting = { title, description };
    await pool.query(
      `INSERT INTO app_settings (skey, svalue) VALUES ('dashboard_greeting', ?)
       ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)`,
      [JSON.stringify(greeting)]
    );
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "settings",
      description: 'Mengubah teks sambutan pada Dashboard ("' + title.slice(0, 60) + '")',
      newData: greeting,
      req,
    });
    res.json({ message: "Sambutan Dashboard berhasil diperbarui", greeting });
  } catch (err) {
    next(err);
  }
});

app.get("/api/stats", async (_req, res, next) => {
  try {
    const [totalData] = await pool.query("SELECT COUNT(*) AS total FROM data_barang");
    const [totalKategori] = await pool.query("SELECT COUNT(*) AS total FROM kategori");
    const [totalSubKategori] = await pool.query("SELECT COUNT(*) AS total FROM sub_kategori");
    const [totalJumlah] = await pool.query("SELECT COALESCE(SUM(jumlah),0) AS total FROM data_barang");
    const [totalNilai] = await pool.query(
      "SELECT COALESCE(SUM(jumlah*harga),0) AS total FROM data_barang"
    );
    const [statusRows] = await pool.query(
      "SELECT status, COUNT(*) AS total FROM data_barang GROUP BY status"
    );
    const [byKategori] = await pool.query(
      `SELECT k.id, k.nama_kategori, COUNT(d.id) AS total,
              COALESCE(SUM(d.jumlah),0) AS total_jumlah,
              COALESCE(SUM(d.jumlah*d.harga),0) AS total_nilai
       FROM kategori k LEFT JOIN data_barang d ON d.kategori_id = k.id
       GROUP BY k.id, k.nama_kategori ORDER BY total_nilai DESC`
    );
    const [bySubKategori] = await pool.query(
      `SELECT sk.id, sk.nama AS nama_sub, k.nama_kategori,
              COUNT(d.id) AS total,
              COALESCE(SUM(d.jumlah),0) AS total_jumlah,
              COALESCE(SUM(d.jumlah*d.harga),0) AS total_nilai
       FROM sub_kategori sk
       LEFT JOIN kategori k ON k.id = sk.kategori_id
       LEFT JOIN data_barang d ON d.sub_kategori_id = sk.id
       GROUP BY sk.id, sk.nama, k.nama_kategori
       ORDER BY k.nama_kategori, total_nilai DESC`
    );
    const [recent] = await pool.query(
      `SELECT d.id, d.kode, d.nama, d.jumlah, d.harga, d.tanggal, d.status, k.nama_kategori, sk.nama AS nama_sub
       FROM data_barang d
       LEFT JOIN kategori k ON k.id = d.kategori_id
       LEFT JOIN sub_kategori sk ON sk.id = d.sub_kategori_id
       ORDER BY d.created_at DESC LIMIT 10`
    );

    res.json({
      totalData: totalData[0].total,
      totalKategori: totalKategori[0].total,
      totalSubKategori: totalSubKategori[0].total,
      totalJumlah: totalJumlah[0].total,
      totalNilai: totalNilai[0].total,
      statusRows,
      byKategori,
      bySubKategori,
      recent,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/kategori", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT k.*, (SELECT COUNT(*) FROM data_barang d WHERE d.kategori_id = k.id) AS jumlah_data
       FROM kategori k ORDER BY k.nama_kategori ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post("/api/kategori", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { nama_kategori, deskripsi, icon } = req.body;
    if (!nama_kategori || !nama_kategori.trim()) {
      return res.status(400).json({ error: "Nama kategori wajib diisi" });
    }
    const [result] = await pool.query(
      "INSERT INTO kategori (nama_kategori, deskripsi, icon) VALUES (?, ?, ?)",
      [nama_kategori.trim(), deskripsi || null, icon || null]
    );
    logAudit({
      userId: req.user.id,
      action: "create",
      module: "kategori",
      description: `Menambah data kategori "${nama_kategori.trim()}"`,
      recordId: result.insertId,
      newData: { nama_kategori: nama_kategori.trim(), deskripsi: deskripsi || null, icon: icon || null },
      req,
    });
    res.status(201).json({ id: result.insertId, message: "Kategori berhasil ditambahkan" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Nama kategori sudah ada" });
    }
    next(err);
  }
});

app.put("/api/kategori/:id", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { nama_kategori, deskripsi, icon, kolom } = req.body;
    if (!nama_kategori || !nama_kategori.trim()) {
      return res.status(400).json({ error: "Nama kategori wajib diisi" });
    }
    const [[old]] = await pool.query(
      "SELECT id, nama_kategori, deskripsi, icon, kolom FROM kategori WHERE id = ?",
      [req.params.id]
    );
    if (!old) return res.status(404).json({ error: "Kategori tidak ditemukan" });
    const kolomJson = Array.isArray(kolom) ? JSON.stringify(kolom) : null;
    const [result] = await pool.query(
      "UPDATE kategori SET nama_kategori = ?, deskripsi = ?, icon = ?, kolom = ? WHERE id = ?",
      [nama_kategori.trim(), deskripsi || null, icon || null, kolomJson, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    }
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "kategori",
      description: `Mengubah data kategori "${nama_kategori.trim()}"`,
      recordId: req.params.id,
      oldData: {
        nama_kategori: old.nama_kategori,
        deskripsi: old.deskripsi,
        icon: old.icon,
        kolom: old.kolom,
      },
      newData: { nama_kategori: nama_kategori.trim(), deskripsi: deskripsi || null, icon: icon || null, kolom: Array.isArray(kolom) ? kolom : undefined },
      req,
    });
    res.json({ message: "Kategori berhasil diubah" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Nama kategori sudah ada" });
    }
    next(err);
  }
});

app.delete("/api/kategori/:id", requireRole("super_admin"), async (req, res, next) => {
  try {
    const [[old]] = await pool.query(
      "SELECT id, nama_kategori, deskripsi, icon FROM kategori WHERE id = ?",
      [req.params.id]
    );
    if (!old) return res.status(404).json({ error: "Kategori tidak ditemukan" });
    const [result] = await pool.query("DELETE FROM kategori WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    }
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "kategori",
      description: `Menghapus data kategori "${old.nama_kategori}"`,
      recordId: req.params.id,
      oldData: { nama_kategori: old.nama_kategori, deskripsi: old.deskripsi, icon: old.icon },
      req,
    });
    res.json({ message: "Kategori berhasil dihapus" });
  } catch (err) {
    next(err);
  }
});

app.get("/api/kategori/:id/subkategori", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT sk.*,
              (SELECT COUNT(*) FROM data_barang d WHERE d.sub_kategori_id = sk.id) AS jumlah_data
       FROM sub_kategori sk WHERE sk.kategori_id = ? ORDER BY sk.urutan, sk.id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post("/api/kategori/:id/subkategori", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { nama, deskripsi, icon } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ error: "Nama sub-kategori wajib diisi" });
    }
    const [[last]] = await pool.query(
      "SELECT MAX(urutan) AS m FROM sub_kategori WHERE kategori_id = ?", [req.params.id]
    );
    const urutan = (last?.m || 0) + 1;
    const [result] = await pool.query(
      "INSERT INTO sub_kategori (kategori_id, nama, deskripsi, icon, urutan) VALUES (?, ?, ?, ?, ?)",
      [req.params.id, nama.trim(), deskripsi || null, icon || null, urutan]
    );
    logAudit({
      userId: req.user.id,
      action: "create",
      module: "kategori",
      description: `Menambah sub-kategori "${nama.trim()}"`,
      recordId: result.insertId,
      newData: { nama: nama.trim(), deskripsi: deskripsi || null, icon: icon || null, urutan },
      req,
    });
    res.status(201).json({ id: result.insertId, message: "Sub-kategori berhasil ditambahkan" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Sub-kategori dengan nama tersebut sudah ada" });
    }
    next(err);
  }
});

app.put("/api/subkategori/:id", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { nama, deskripsi, urutan, icon } = req.body;
    const [[old]] = await pool.query(
      "SELECT id, nama, deskripsi, urutan, icon FROM sub_kategori WHERE id = ?",
      [req.params.id]
    );
    if (!old) return res.status(404).json({ error: "Sub-kategori tidak ditemukan" });
    const sets = [];
    const params = [];
    if (nama !== undefined) { sets.push("nama = ?"); params.push(nama.trim()); }
    if (deskripsi !== undefined) { sets.push("deskripsi = ?"); params.push(deskripsi); }
    if (urutan !== undefined) { sets.push("urutan = ?"); params.push(urutan); }
    if (icon !== undefined) { sets.push("icon = ?"); params.push(icon || null); }
    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada yang diubah" });
    params.push(req.params.id);
    const [result] = await pool.query(
      `UPDATE sub_kategori SET ${sets.join(", ")} WHERE id = ?`, params
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Sub-kategori tidak ditemukan" });
    }
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "kategori",
      description: `Mengubah sub-kategori "${old.nama}"`,
      recordId: req.params.id,
      oldData: { nama: old.nama, deskripsi: old.deskripsi, urutan: old.urutan, icon: old.icon },
      newData: {
        nama: nama !== undefined ? nama.trim() : old.nama,
        deskripsi: deskripsi !== undefined ? deskripsi : old.deskripsi,
        urutan: urutan !== undefined ? urutan : old.urutan,
        icon: icon !== undefined ? icon || null : old.icon,
      },
      req,
    });
    res.json({ message: "Sub-kategori berhasil diubah" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Nama sub-kategori sudah ada" });
    }
    next(err);
  }
});

app.delete("/api/subkategori/:id", requireRole("super_admin"), async (req, res, next) => {
  try {
    const [[old]] = await pool.query(
      "SELECT id, nama, kategori_id FROM sub_kategori WHERE id = ?",
      [req.params.id]
    );
    if (!old) return res.status(404).json({ error: "Sub-kategori tidak ditemukan" });
    const [result] = await pool.query("DELETE FROM sub_kategori WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Sub-kategori tidak ditemukan" });
    }
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "kategori",
      description: `Menghapus sub-kategori "${old.nama}"`,
      recordId: req.params.id,
      oldData: { nama: old.nama, kategori_id: old.kategori_id },
      req,
    });
    res.json({ message: "Sub-kategori berhasil dihapus" });
  } catch (err) {
    next(err);
  }
});

app.get("/api/kategori/:id/ringkasan", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT sk.id, sk.nama, sk.urutan,
              COUNT(d.id) AS jumlah_item,
              COALESCE(SUM(d.jumlah), 0) AS total_jumlah,
              COALESCE(SUM(d.jumlah * d.harga), 0) AS total_nilai
       FROM sub_kategori sk
       LEFT JOIN data_barang d ON d.sub_kategori_id = sk.id
       WHERE sk.kategori_id = ?
       GROUP BY sk.id, sk.nama, sk.urutan
       ORDER BY sk.urutan, sk.id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ===== RBAC: izin entry/edit Admin pada tabel yang ditugaskan =====
// mode = "entry" (tambah data) | "edit" (ubah/hapus data)
async function adminCanTouchKategori(req, kategoriId, mode) {
  if (req.user.role === "super_admin") return true;
  if (req.user.role !== "admin") return false;
  if (!kategoriId) return false;
  const col = mode === "entry" ? "can_entry" : "can_edit";
  const [[row]] = await pool.query(
    `SELECT id FROM admin_table_permissions
     WHERE user_id = ? AND tipe = 'kategori' AND tabel_id = ? AND ${col} = 1 LIMIT 1`,
    [req.user.id, kategoriId]
  );
  return !!row;
}

async function adminCanTouchSpreadsheet(req, sheetId, mode) {
  if (req.user.role === "super_admin") return true;
  if (req.user.role !== "admin") return false;
  if (!sheetId) return false;
  const col = mode === "entry" ? "can_entry" : "can_edit";
  const [[row]] = await pool.query(
    `SELECT id FROM admin_table_permissions
     WHERE user_id = ? AND tipe = 'spreadsheet' AND tabel_id = ? AND ${col} = 1 LIMIT 1`,
    [req.user.id, sheetId]
  );
  return !!row;
}

// ---- Izin granular per sub-tabel / kolom / baris (spreadsheet) ----

function parseJsonField(v) {
  if (typeof v === "string") { try { return JSON.parse(v); } catch {} }
  return v;
}

// Kumpulkan kunci kolom yang benar-benar ditulis pada payload.
function collectWrittenColumns(body) {
  const cols = new Set();
  const STANDARD = ["kode", "nama", "jumlah", "harga", "tanggal", "status", "keterangan"];
  for (const k of STANDARD) if (body[k] !== undefined) cols.add(k);
  const nilai = body.nilai;
  if (nilai && typeof nilai === "object" && !Array.isArray(nilai)) Object.keys(nilai).forEach((k) => cols.add(k));
  const formulas = body.formulas;
  if (formulas && typeof formulas === "object" && !Array.isArray(formulas)) Object.keys(formulas).forEach((k) => cols.add(k));
  return [...cols];
}

// Muat seluruh izin spreadsheet admin yang relevan untuk sheet & mode.
// Kembalian: "super" (super_admin), null (tidak berhak), atau daftar baris izin.
async function loadSpreadsheetPerms(req, sheetId, mode) {
  if (req.user.role === "super_admin") return "super";
  if (req.user.role !== "admin") return null;
  if (!sheetId) return null;
  const col = mode === "entry" ? "can_entry" : "can_edit";
  const [rows] = await pool.query(
    `SELECT p.section_id, p.kolom_izin, p.baris_izin,
            s.baris_awal, s.baris_akhir, s.kolom AS section_kolom
     FROM admin_table_permissions p
     LEFT JOIN spreadsheet_sections s ON s.id = p.section_id
     WHERE p.user_id = ? AND p.tipe = 'spreadsheet' AND p.tabel_id = ? AND p.${col} = 1`,
    [req.user.id, sheetId]
  );
  return rows.length ? rows : null;
}

// Posisi baris dalam sheet (1-based, urut id menaik).
async function sheetRowPos(sheetId, dataId) {
  const [[r]] = await pool.query(
    "SELECT COUNT(*) + 1 AS pos FROM data_barang WHERE sheet_id = ? AND id <= ?",
    [sheetId, dataId]
  );
  return Number(r.pos);
}

function rowAllowed(pos, filter) {
  if (!filter) return true;
  // baris di dalam rentang terkunci => tidak boleh (kecuali ditimpa rentang izin lain)
  if (Array.isArray(filter.locks) && filter.locks.length) {
    if (filter.locks.some((lk) => inRange(pos, lk && lk.awal, lk && lk.akhir))) return false;
  }
  if (Array.isArray(filter.ranges) && filter.ranges.length) {
    return filter.ranges.some((rg) => inRange(pos, rg && rg.awal, rg && rg.akhir));
  }
  if (Array.isArray(filter.rows)) return filter.rows.includes(pos);
  return inRange(pos, filter.awal, filter.akhir);
}

function inRange(pos, awal, akhir) {
  const a = awal != null ? Number(awal) : null;
  const b = akhir != null ? Number(akhir) : null;
  if (a != null && pos < a) return false;
  if (b != null && pos > b) return false;
  return true;
}

// true bila cell (posisi baris, kolom) berada dalam rentang terkunci.
function lockedCell(pos, colKey, lock) {
  if (!lock) return false;
  if (!inRange(pos, lock.awal, lock.akhir)) return false;
  if (Array.isArray(lock.kolom) && lock.kolom.length) return lock.kolom.map(String).includes(String(colKey));
  return true;
}

function colsAllowed(allowedCols, changedCols) {
  if (!allowedCols || allowedCols.length === 0) return true;
  const set = new Set(allowedCols);
  return changedCols.every((c) => set.has(c));
}

function sectionAllowedCols(p) {
  if (Array.isArray(p.section_kolom) && p.section_kolom.length) {
    return p.section_kolom.map((c) => (typeof c === "string" ? c : (c && c.key))).filter(Boolean);
  }
  return null;
}

// Baris yang boleh disentuh admin: prioritas baris_izin pada penugasan,
// kemudian rentang baris sub-tabel yang ditunjuk.
// Baris_izin mendukung bentuk: {awal,akhir}, {rows:[...]}, {ranges:[{awal,akhir,kolom?}]}.
function permRange(p) {
  const izin = parseJsonField(p.baris_izin);
  if (izin && ((Array.isArray(izin.ranges) && izin.ranges.length) || (Array.isArray(izin.locks) && izin.locks.length))) {
    const normalize = (r) => ({
      awal: r && r.awal != null ? Number(r.awal) : null,
      akhir: r && r.akhir != null ? Number(r.akhir) : null,
      kolom: Array.isArray(r && r.kolom) && r.kolom.length ? r.kolom.map(String) : null,
    });
    const ranges = Array.isArray(izin.ranges)
      ? izin.ranges.map(normalize).filter((r) => r.awal != null || r.akhir != null)
      : [];
    const locks = Array.isArray(izin.locks)
      ? izin.locks.map(normalize).filter((r) => r.awal != null || r.akhir != null)
      : null;
    const out = { ranges };
    if (locks && locks.length) out.locks = locks;
    return out;
  }
  if (izin && Array.isArray(izin.rows) && izin.rows.length) {
    const rows = izin.rows.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1);
    if (rows.length) return { rows };
  }
  const awal = izin && izin.awal != null ? Number(izin.awal) : (p.baris_awal != null ? Number(p.baris_awal) : null);
  const akhir = izin && izin.akhir != null ? Number(izin.akhir) : (p.baris_akhir != null ? Number(p.baris_akhir) : null);
  if (awal == null && akhir == null) return null;
  return { awal, akhir };
}

// true jika ada SATU izin yang mencakup posisi baris DAN seluruh kolom yang ditulis.
async function adminCanWriteSpreadsheetRow(req, sheetId, dataId, changedCols, mode, opts = {}) {
  const perms = await loadSpreadsheetPerms(req, sheetId, mode);
  if (perms === "super") return true;
  if (!perms) return false;
  const columns = opts.changedCols !== undefined ? opts.changedCols : (changedCols || []);
  const pos =
    opts.rowPos !== undefined
      ? opts.rowPos
      : dataId != null
        ? await sheetRowPos(sheetId, dataId)
        : null;
  for (const p of perms) {
    const range = permRange(p);
    const kolom = parseJsonField(p.kolom_izin);
    const globalCols =
      kolom && kolom.length ? kolom.map(String) : sectionAllowedCols(p);
    // Rentang terkunci pada penugasan ini membatalkan izin untuk cell tsb.
    const locks = range && Array.isArray(range.locks) ? range.locks : null;
    if (pos != null && locks && locks.length) {
      const locked = columns.some((ck) => locks.some((lk) => lockedCell(pos, ck, lk)));
      if (locked) continue;
    }
    if (range && Array.isArray(range.ranges) && range.ranges.length) {
      for (const rg of range.ranges) {
        if (pos != null && !inRange(pos, rg.awal, rg.akhir)) continue;
        // kolom per rentang menang; jika kosong, turun ke kolom_izin penugasan.
        const allowedCols = rg.kolom && rg.kolom.length ? rg.kolom : globalCols;
        if (colsAllowed(allowedCols, columns)) return true;
      }
      continue;
    }
    if (pos != null && !rowAllowed(pos, range)) continue;
    if (colsAllowed(globalCols, columns)) return true;
  }
  return false;
}

// true jika ada SATU izin yang mencakup posisi baris (untuk menghapus seluruh baris).
async function adminCanDeleteSpreadsheetRow(req, sheetId, dataId, mode) {
  const perms = await loadSpreadsheetPerms(req, sheetId, mode);
  if (perms === "super") return true;
  if (!perms) return false;
  const pos = await sheetRowPos(sheetId, dataId);
  return perms.some((p) => rowAllowed(pos, permRange(p)));
}

// ===== Penugasan berbasis Cakupan (workbook/sheet/kolom/baris/range/cell) =====
//
// Aturan ini hanya berisi referensi (workbook, sheet_id, koordinat) - TIDAK ada
// data atau salinan workbook. Progress tetap milik data sumber yang sama.
//
// Di endpoint /api/data* koordinat yang tersedia adalah "posisi baris data",
// jadi lapis yang bisa diterapkan di sini adalah level Workbook & Sheet.
// Level kolom/baris/range/cell diterapkan di halaman Spreadsheet (koordinat
// native sheet, sama dengan pratinjau). Jika Admin tidak punya aturan cakupan
// untuk sheet tersebut, perilaku lama (admin_table_permissions) tetap berlaku.

const { toRule, rulesForSheet, workbookAliases } = require("./assignmentScopes");

async function loadScopeRules(adminId) {
  const [rows] = await pool.query(
    "SELECT * FROM admin_assignment_scopes WHERE admin_id = ? ORDER BY id ASC",
    [adminId]
  );
  return rows.map(toRule);
}

// true = terkunci oleh aturan cakupan level workbook/sheet.
// mode "entry" (baris baru) hanya memandang canEntry; mode "edit" (ubah/hapus)
// Regard canEdit. Level kolom/baris/range/cell tidak bisa dinilai di sini karena
// endpoint /api/data hanya membawa "posisi baris data", bukan koordinat native.
async function scopeBlocksSheet(req, sheetId, mode = "edit") {
  if (!req.user || req.user.role !== "admin" || !sheetId) return false;
  const [[sh]] = await pool.query(
    "SELECT id, nama, sumber_file FROM spreadsheet WHERE id = ?",
    [Number(sheetId)]
  );
  if (!sh) return false;
  const rules = await loadScopeRules(req.user.id);
  if (!rules.length) return false;
  const rel = rulesForSheet(rules, { workbookKey: sh.sumber_file || sh.nama, sheetId: sh.id });
  // Hanya level paling umum yang bisa dinilai tanpa koordinat native.
  const coarse = rel.filter((r) => r.level === "workbook" || r.level === "sheet");
  if (!coarse.length) return false;
  // Level sheet lebih spesifik daripada workbook; di level sama ambil id terkecil.
  const winner = coarse.reduce((best, r) => {
    if (!best) return r;
    if (r.level === "workbook") return best;
    if (best.level === "workbook") return r;
    return best.id < r.id ? best : r;
  }, null);
  if (!winner) return false;
  if (winner.status === "lock") return true;
  const flag = mode === "entry" ? winner.canEntry : winner.canEdit;
  return flag === false;
}

app.get("/api/data", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(1000000, Math.max(1, parseInt(req.query.perPage) || 10));
    const { whereSql, params } = buildDataFilter(req.query);

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM data_barang d ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT d.id, d.kode, d.nama, d.jumlah, d.harga, d.tanggal, d.status, d.keterangan,
              d.formulas, d.nilai, d.kategori_id, d.sub_kategori_id, k.nama_kategori
       FROM data_barang d LEFT JOIN kategori k ON k.id = d.kategori_id
       ${whereSql}
       ${req.query.order === "asc" ? "ORDER BY d.id ASC" : "ORDER BY d.id DESC"}
       LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    );

    res.json({ data: rows, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/data", async (req, res, next) => {
  try {
    const { kode, nama, kategori_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai, sheet_id } = req.body;
    const sheetId = sheet_id || null;
    if (sheetId) {
      // Aturan cakupan level workbook/sheet (LOCK) menutupi seluruh sheet.
      if (await scopeBlocksSheet(req, sheetId, "entry")) {
        return res.status(403).json({ error: "Sheet ini terkunci untuk akun Anda oleh Super Admin" });
      }
      // Entry ke spreadsheet: harus punya izin entry pada sheet + cakupan kolom,
      // dan baris baru harus jatuh dalam rentang bagian yang ditugaskan.
      const [[{ n }]] = await pool.query(
        "SELECT COUNT(*) AS n FROM data_barang WHERE sheet_id = ?",
        [sheetId]
      );
      const changed = collectWrittenColumns(req.body);
      const canSheet = await adminCanWriteSpreadsheetRow(
        req,
        sheetId,
        null,
        changed,
        "entry",
        { rowPos: Number(n) + 1 }
      );
      if (!canSheet) {
        return res.status(403).json({ error: "Anda tidak memiliki izin entry pada bagian/kolom baris ini" });
      }
    } else if (!(await adminCanTouchKategori(req, kategori_id || null, "entry"))) {
      return res.status(403).json({ error: "Anda tidak memiliki izin entry pada tabel ini" });
    }
    if (!kode || !kode.trim() || !nama || !nama.trim()) {
      return res.status(400).json({ error: "Kode dan Nama wajib diisi" });
    }
    const formulasJson =
      formulas && typeof formulas === "object" && !Array.isArray(formulas)
        ? JSON.stringify(formulas)
        : null;
    const nilaiJson =
      nilai && typeof nilai === "object" && !Array.isArray(nilai) ? JSON.stringify(nilai) : null;
    const [result] = await pool.query(
      `INSERT INTO data_barang (kode, nama, kategori_id, sheet_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kode.trim(),
        nama.trim(),
        kategori_id || null,
        sheetId,
        Number(jumlah) || 0,
        Number(harga) || 0,
        tanggal || new Date().toISOString().slice(0, 10),
        status || "Pending",
        keterangan || null,
        formulasJson,
        nilaiJson,
      ]
    );
    logAudit({
      userId: req.user.id,
      action: "create",
      module: "data",
      description: `Menambah data "${nama.trim()}" (${kode.trim()})`,
      recordId: result.insertId,
      newData: {
        kode: kode.trim(),
        nama: nama.trim(),
        kategori_id: kategori_id || null,
        sheet_id: sheetId,
        jumlah: Number(jumlah) || 0,
        harga: Number(harga) || 0,
        tanggal: tanggal || new Date().toISOString().slice(0, 10),
        status: status || "Pending",
        keterangan: keterangan || null,
        formulas: formulasJson ? JSON.parse(formulasJson) : null,
        nilai: nilaiJson ? JSON.parse(nilaiJson) : null,
      },
      req,
    });
    res.status(201).json({ id: result.insertId, message: "Data berhasil ditambahkan" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Kode data sudah ada" });
    }
    next(err);
  }
});

app.put("/api/data/:id", async (req, res, next) => {
  try {
    const { kode, nama, kategori_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai } = req.body;
    // Admin harus punya izin edit pada tabel asal DAN tabel tujuan (jika dipindah).
    const [[cur]] = await pool.query(
      "SELECT * FROM data_barang WHERE id = ?",
      [req.params.id]
    );
    if (!cur) return res.status(404).json({ error: "Data tidak ditemukan" });
    // Baris milik spreadsheet: izin sheet yang mengatur (menggantikan izin kategori).
    if (cur.sheet_id) {
      const changed = collectWrittenColumns(req.body);
      // Rumus selalu terkunci: admin tidak boleh menimpa cell berisi formula
      // maupun menambah/mengubah definisi formula.
      if (req.user.role === "admin") {
        const curFm = parseJsonField(cur.formulas) || {};
        for (const c of changed) {
          if (curFm[c]) {
            return res.status(403).json({ error: "Cell berisi rumus (formula) terkunci dan tidak boleh diedit Admin" });
          }
        }
        if (formulas && typeof formulas === "object" && !Array.isArray(formulas) && Object.keys(formulas).length) {
          return res.status(403).json({ error: "Rumus (formula) tidak boleh diubah oleh Admin" });
        }
      }
      if (await scopeBlocksSheet(req, cur.sheet_id)) {
        return res.status(403).json({ error: "Sheet ini terkunci untuk akun Anda oleh Super Admin" });
      }
      const canSheet = await adminCanWriteSpreadsheetRow(req, cur.sheet_id, cur.id, changed, "edit");
      if (!canSheet) {
        return res.status(403).json({ error: "Anda tidak memiliki izin edit pada bagian/kolom baris ini" });
      }
    } else {
      // Admin harus punya izin edit pada tabel asal DAN tabel tujuan (jika dipindah).
      const target = kategori_id || null;
      if (
        !(await adminCanTouchKategori(req, cur.kategori_id, "edit")) ||
        !(await adminCanTouchKategori(req, target, "edit"))
      ) {
        return res.status(403).json({ error: "Anda tidak memiliki izin edit pada tabel ini" });
      }
    }
    if (!kode || !kode.trim() || !nama || !nama.trim()) {
      return res.status(400).json({ error: "Kode dan Nama wajib diisi" });
    }
    const formulasJson =
      formulas && typeof formulas === "object" && !Array.isArray(formulas)
        ? JSON.stringify(formulas)
        : null;
    const nilaiJson =
      nilai && typeof nilai === "object" && !Array.isArray(nilai) ? JSON.stringify(nilai) : null;
    const [result] = await pool.query(
      `UPDATE data_barang
       SET kode = ?, nama = ?, kategori_id = ?, jumlah = ?, harga = ?, tanggal = ?, status = ?, keterangan = ?, formulas = ?, nilai = ?
       WHERE id = ?`,
      [
        kode.trim(),
        nama.trim(),
        kategori_id || null,
        Number(jumlah) || 0,
        Number(harga) || 0,
        tanggal || new Date().toISOString().slice(0, 10),
        status || "Pending",
        keterangan || null,
        formulasJson,
        nilaiJson,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Data tidak ditemukan" });
    }
    logAudit({
      userId: req.user.id,
      action: "edit",
      module: "data",
      description: `Mengubah data "${nama.trim()}" (${kode.trim()})`,
      recordId: req.params.id,
      oldData: {
        kode: cur.kode,
        nama: cur.nama,
        kategori_id: cur.kategori_id,
        jumlah: Number(cur.jumlah),
        harga: Number(cur.harga),
        tanggal: cur.tanggal ? String(cur.tanggal).slice(0, 10) : null,
        status: cur.status,
        keterangan: cur.keterangan,
        formulas: cur.formulas || null,
        nilai: cur.nilai || null,
      },
      newData: {
        kode: kode.trim(),
        nama: nama.trim(),
        kategori_id: kategori_id || null,
        jumlah: Number(jumlah) || 0,
        harga: Number(harga) || 0,
        tanggal: tanggal || new Date().toISOString().slice(0, 10),
        status: status || "Pending",
        keterangan: keterangan || null,
        formulas: formulasJson ? JSON.parse(formulasJson) : null,
        nilai: nilaiJson ? JSON.parse(nilaiJson) : null,
      },
      req,
    });
    res.json({ message: "Data berhasil diubah" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Kode data sudah ada" });
    }
    next(err);
  }
});

app.delete("/api/data/:id", async (req, res, next) => {
  try {
    const [[cur]] = await pool.query("SELECT * FROM data_barang WHERE id = ?", [req.params.id]);
    if (!cur) return res.status(404).json({ error: "Data tidak ditemukan" });
    if (cur.sheet_id) {
      if (await scopeBlocksSheet(req, cur.sheet_id)) {
        return res.status(403).json({ error: "Sheet ini terkunci untuk akun Anda oleh Super Admin" });
      }
      const canSheet = await adminCanDeleteSpreadsheetRow(req, cur.sheet_id, cur.id, "edit");
      if (!canSheet) {
        return res.status(403).json({ error: "Anda tidak memiliki izin menghapus pada bagian baris ini" });
      }
    } else if (!(await adminCanTouchKategori(req, cur.kategori_id, "edit"))) {
      return res.status(403).json({ error: "Anda tidak memiliki izin menghapus data pada tabel ini" });
    }
    const [result] = await pool.query("DELETE FROM data_barang WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Data tidak ditemukan" });
    }
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "data",
      description: `Menghapus data "${cur.nama}" (${cur.kode})`,
      recordId: req.params.id,
      oldData: {
        kode: cur.kode,
        nama: cur.nama,
        kategori_id: cur.kategori_id,
        jumlah: Number(cur.jumlah),
        harga: Number(cur.harga),
        tanggal: cur.tanggal ? String(cur.tanggal).slice(0, 10) : null,
        status: cur.status,
        keterangan: cur.keterangan,
        formulas: cur.formulas || null,
        nilai: cur.nilai || null,
      },
      req,
    });
    res.json({ message: "Data berhasil dihapus" });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/data/bulk/kategori/:kategoriId", requireRole("super_admin"), async (req, res, next) => {
  try {
    const [[kat]] = await pool.query(
      "SELECT nama_kategori FROM kategori WHERE id = ?",
      [req.params.kategoriId]
    );
    const [result] = await pool.query("DELETE FROM data_barang WHERE kategori_id = ?", [req.params.kategoriId]);
    logAudit({
      userId: req.user.id,
      action: "clean",
      module: "data",
      description: `Membersihkan ${result.affectedRows} data kategori "${kat ? kat.nama_kategori : req.params.kategoriId}"`,
      recordId: req.params.kategoriId || null,
      newData: { kategoriId: req.params.kategoriId, deleted: result.affectedRows, nama_kategori: kat ? kat.nama_kategori : null },
      req,
    });
    res.json({ message: "Semua data kategori berhasil dihapus", deleted: result.affectedRows });
  } catch (err) {
    next(err);
  }
});

async function buildSnapshot(kategoriId) {
  const [[k]] = await pool.query("SELECT nama_kategori, kolom FROM kategori WHERE id = ?", [kategoriId]);
  const [rows] = await pool.query(
    `SELECT kode, nama, kategori_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai
     FROM data_barang WHERE kategori_id = ? ORDER BY id`,
    [kategoriId]
  );
  return {
    nama_kategori: k ? k.nama_kategori : null,
    kolom: k && k.kolom ? k.kolom : null,
    rows,
  };
}

// Snapshot riwayat boleh dibuat oleh Super Admin maupun Admin (mencatat aksi edit).
app.post("/api/riwayat", requireRole("admin", "super_admin"), async (req, res, next) => {
  try {
    const { kategoriId, aksi, catatan } = req.body || {};
    const allowed = ["simpan", "hapus", "hapus_semua", "pulihkan", "import"];
    const act = allowed.includes(aksi) ? aksi : "simpan";
    const snapshot = await buildSnapshot(kategoriId || null);
    const [result] = await pool.query(
      "INSERT INTO riwayat (kategori_id, aksi, catatan, data) VALUES (?, ?, ?, ?)",
      [kategoriId || null, act, catatan || null, JSON.stringify(snapshot)]
    );
    logAudit({
      userId: req.user.id,
      action: act === "simpan" ? "create" : "update",
      module: "riwayat",
      description: `Menyimpan riwayat "${act}" (${snapshot.rows.length} baris)`,
      recordId: result.insertId,
      newData: { kategoriId: kategoriId || null, aksi: act, catatan: catatan || null, rows: snapshot.rows.length },
      req,
    });
    res.status(201).json({ id: result.insertId, message: "Riwayat tersimpan" });
  } catch (err) {
    next(err);
  }
});

app.get("/api/riwayat", async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.kategoriId) {
      where.push("kategori_id = ?");
      params.push(req.query.kategoriId);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT id, kategori_id, aksi, catatan, created_at,
              JSON_LENGTH(JSON_EXTRACT(data, '$.rows')) AS jumlah_baris
       FROM riwayat ${whereSql}
       ORDER BY id DESC
       LIMIT 300`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.get("/api/riwayat/:id", async (req, res, next) => {
  try {
    const [[row]] = await pool.query("SELECT * FROM riwayat WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Riwayat tidak ditemukan" });
    row.data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    res.json(row);
  } catch (err) {
    next(err);
  }
});

app.delete("/api/riwayat/:id", requireRole("super_admin"), async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM riwayat WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Riwayat tidak ditemukan" });
    }
    res.json({ message: "Riwayat dihapus" });
  } catch (err) {
    next(err);
  }
});

app.post("/api/riwayat/:id/pulihkan", requireRole("super_admin"), async (req, res, next) => {
  try {
    const [[row]] = await pool.query("SELECT * FROM riwayat WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Riwayat tidak ditemukan" });
    const snap = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    const katId = row.kategori_id;
    if (!katId) return res.status(400).json({ error: "Snapshot tanpa kategori tidak bisa dipulihkan" });

    const current = await buildSnapshot(katId);
    await pool.query(
      "INSERT INTO riwayat (kategori_id, aksi, catatan, data) VALUES (?, 'pulihkan', ?, ?)",
      [katId, `Keadaan sebelum memulihkan riwayat #${row.id}`, JSON.stringify(current)]
    );

    await pool.query("DELETE FROM data_barang WHERE kategori_id = ?", [katId]);
    for (const r of snap.rows || []) {
      await pool.query(
        `INSERT INTO data_barang (kode, nama, kategori_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.kode,
          r.nama,
          katId,
          r.jumlah ?? 0,
          r.harga ?? 0,
          r.tanggal ? fmtDate(r.tanggal) : new Date().toISOString().slice(0, 10),
          r.status || "Pending",
          r.keterangan || null,
          r.formulas ? JSON.stringify(r.formulas) : null,
          r.nilai ? JSON.stringify(r.nilai) : null,
        ]
      );
    }
    if (snap.kolom) {
      await pool.query("UPDATE kategori SET kolom = ? WHERE id = ?", [JSON.stringify(snap.kolom), katId]);
    }
    logAudit({
      userId: req.user.id,
      action: "restore",
      module: "riwayat",
      description: `Memulihkan riwayat #${row.id} (${(snap.rows || []).length} baris)`,
      recordId: row.id,
      oldData: { kategoriId: katId, rows: (current.rows || []).length },
      newData: { kategoriId: katId, aksi: row.aksi, rows: (snap.rows || []).length },
      req,
    });
    res.json({ message: "Data berhasil dipulihkan", rows: (snap.rows || []).length });
  } catch (err) {
    next(err);
  }
});

app.get("/api/report", async (_req, res, next) => {
  try {
    const [summary] = await pool.query(
      `SELECT COUNT(*) AS total_data,
              COALESCE(SUM(jumlah),0) AS total_jumlah,
              COALESCE(SUM(jumlah*harga),0) AS total_nilai
       FROM data_barang`
    );
    const [byKategori] = await pool.query(
      `SELECT k.nama_kategori,
              COUNT(d.id) AS jumlah_item,
              COALESCE(SUM(d.jumlah),0) AS total_jumlah,
              COALESCE(SUM(d.jumlah*d.harga),0) AS total_nilai
       FROM kategori k LEFT JOIN data_barang d ON d.kategori_id = k.id
       GROUP BY k.id, k.nama_kategori
       ORDER BY total_nilai DESC, k.nama_kategori ASC`
    );
    const [byStatus] = await pool.query(
      `SELECT status,
              COUNT(*) AS jumlah_item,
              COALESCE(SUM(jumlah),0) AS total_jumlah,
              COALESCE(SUM(jumlah*harga),0) AS total_nilai
       FROM data_barang
       GROUP BY status
       ORDER BY FIELD(status, 'Masuk', 'Keluar', 'Pending')`
    );
    const [byBulan] = await pool.query(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m') AS bulan,
              DATE_FORMAT(tanggal, '%M %Y') AS nama_bulan,
              COUNT(*) AS jumlah_item,
              COALESCE(SUM(jumlah),0) AS total_jumlah,
              COALESCE(SUM(jumlah*harga),0) AS total_nilai
       FROM data_barang
       GROUP BY bulan, nama_bulan
       ORDER BY bulan ASC`
    );
    res.json({ summary: summary[0], byKategori, byStatus, byBulan });
  } catch (err) {
    next(err);
  }
});

app.get("/api/data/yearly", async (req, res, next) => {
  try {
    const kategoriId = req.query.kategoriId || null;
    const subKategoriId = req.query.subKategoriId || null;
    const where = [];
    const params = [];
    if (kategoriId) { where.push("d.kategori_id = ?"); params.push(kategoriId); }
    if (subKategoriId) { where.push("d.sub_kategori_id = ?"); params.push(subKategoriId); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT YEAR(d.tanggal) AS tahun,
              d.sub_kategori_id,
              d.status,
              COALESCE(SUM(d.jumlah), 0) AS total_jumlah,
              COALESCE(SUM(d.harga), 0) AS total_harga,
              COALESCE(SUM(d.jumlah * d.harga), 0) AS total_nilai,
              COUNT(d.id) AS jumlah_item
       FROM data_barang d ${w}
       GROUP BY YEAR(d.tanggal), d.sub_kategori_id, d.status
       ORDER BY tahun ASC`,
      params
    );

    const [allYears] = await pool.query(
      `SELECT YEAR(d.tanggal) AS tahun
       FROM data_barang d ${w}
       GROUP BY YEAR(d.tanggal) ORDER BY tahun ASC`,
      params
    );
    const years = allYears.map((r) => r.tahun);

    const [byKategori] = await pool.query(
      `SELECT YEAR(d.tanggal) AS tahun, k.nama_kategori,
              COALESCE(SUM(d.jumlah * d.harga), 0) AS total_nilai,
              COALESCE(SUM(d.jumlah), 0) AS total_jumlah,
              COUNT(d.id) AS jumlah_item
       FROM data_barang d LEFT JOIN kategori k ON k.id = d.kategori_id ${w}
       GROUP BY YEAR(d.tanggal), k.id, k.nama_kategori
       ORDER BY tahun ASC`,
      params
    );

    const [bySubKategori] = await pool.query(
      `SELECT YEAR(d.tanggal) AS tahun, sk.nama AS sub_kategori, k.nama_kategori,
              COALESCE(SUM(d.jumlah * d.harga), 0) AS total_nilai,
              COALESCE(SUM(d.jumlah), 0) AS total_jumlah,
              COUNT(d.id) AS jumlah_item
       FROM data_barang d
       LEFT JOIN sub_kategori sk ON sk.id = d.sub_kategori_id
       LEFT JOIN kategori k ON k.id = d.kategori_id ${w}
       GROUP BY YEAR(d.tanggal), sk.id, sk.nama, k.nama_kategori
       ORDER BY tahun ASC`,
      params
    );

    res.json({ years, rows, byKategori, bySubKategori });
  } catch (err) {
    next(err);
  }
});

app.get("/api/stats/yearly", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT YEAR(d.tanggal) AS tahun,
              k.nama_kategori,
              COALESCE(SUM(d.jumlah), 0) AS total_jumlah,
              COALESCE(SUM(d.jumlah * d.harga), 0) AS total_nilai,
              COUNT(d.id) AS jumlah_item
       FROM data_barang d
       LEFT JOIN kategori k ON k.id = d.kategori_id
       GROUP BY YEAR(d.tanggal), k.id, k.nama_kategori
       ORDER BY tahun ASC, k.nama_kategori ASC`
    );

    const [years] = await pool.query(
      `SELECT YEAR(tanggal) AS tahun FROM data_barang GROUP BY YEAR(tanggal) ORDER BY tahun ASC`
    );

    const [totals] = await pool.query(
      `SELECT YEAR(tanggal) AS tahun,
              COALESCE(SUM(jumlah), 0) AS total_jumlah,
              COALESCE(SUM(jumlah * harga), 0) AS total_nilai,
              COUNT(id) AS jumlah_item
       FROM data_barang GROUP BY YEAR(tanggal) ORDER BY tahun ASC`
    );

    res.json({ years: years.map((r) => r.tahun), byKategori: rows, totals });
  } catch (err) {
    next(err);
  }
});

app.get("/api/export/excel", async (req, res, next) => {
  try {
    const { whereSql, params } = buildDataFilter(req.query);
    const [rows] = await pool.query(
      `SELECT d.id, d.kode, d.nama, d.jumlah, d.harga, d.tanggal, d.status, d.keterangan, k.nama_kategori
       FROM data_barang d LEFT JOIN kategori k ON k.id = d.kategori_id
       ${whereSql}
       ORDER BY d.tanggal DESC, d.id DESC`,
      params
    );
    const [[sum]] = await pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(jumlah),0) AS j, COALESCE(SUM(jumlah*harga),0) AS v
       FROM data_barang d ${whereSql}`,
      params
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = "SISNERLING";
    wb.created = new Date();

    const wsData = wb.addWorksheet("Data");
    wsData.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Kode", key: "kode", width: 12 },
      { header: "Nama", key: "nama", width: 26 },
      { header: "Kategori", key: "kategori", width: 16 },
      { header: "Jumlah", key: "jumlah", width: 10 },
      { header: "Harga", key: "harga", width: 16 },
      { header: "Total", key: "total", width: 18 },
      { header: "Tanggal", key: "tanggal", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Keterangan", key: "keterangan", width: 32 },
    ];
    rows.forEach((r, i) =>
      wsData.addRow({
        no: i + 1,
        kode: r.kode,
        nama: r.nama,
        kategori: r.nama_kategori || "-",
        jumlah: Number(r.jumlah),
        harga: Number(r.harga),
        total: Number(r.jumlah) * Number(r.harga),
        tanggal: fmtDate(r.tanggal),
        status: r.status,
        keterangan: r.keterangan || "",
      })
    );
    const headerRow = wsData.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;
    wsData.eachRow((row, i) => {
      if (i > 1) row.alignment = { vertical: "middle" };
      wsData.getColumn(6).numFmt = '"Rp" #,##0';
      wsData.getColumn(7).numFmt = '"Rp" #,##0';
    });

    const wsSum = wb.addWorksheet("Ringkasan");
    const addSection = (title, items) => {
      const r = wsSum.addRow([title]);
      r.font = { bold: true, size: 12, color: { argb: "FF6D28D9" } };
      items.forEach(([label, value]) => wsSum.addRow([label, value]));
      wsSum.addRow([]);
    };
    addSection("Ringkasan Umum", [
      ["Total Data", Number(sum.n)],
      ["Total Jumlah", Number(sum.j)],
      ["Total Nilai", Number(sum.v)],
    ]);
    const [kat] = await pool.query(
      `SELECT k.nama_kategori, COUNT(d.id) AS jml, COALESCE(SUM(d.jumlah),0) AS qty, COALESCE(SUM(d.jumlah*d.harga),0) AS nilai
       FROM kategori k LEFT JOIN data_barang d ON d.kategori_id = k.id
       GROUP BY k.id, k.nama_kategori ORDER BY nilai DESC`
    );
    addSection(
      "Per Kategori",
      kat.map((k) => [k.nama_kategori, `${k.jml} item, ${Number(k.qty)} unit, Rp ${fmtNum(k.nilai)}`])
    );
    const [sts] = await pool.query(
      `SELECT status, COUNT(*) AS jml, COALESCE(SUM(jumlah),0) AS qty, COALESCE(SUM(jumlah*harga),0) AS nilai
       FROM data_barang GROUP BY status`
    );
    addSection(
      "Per Status",
      sts.map((s) => [s.status, `${s.jml} item, ${Number(s.qty)} unit, Rp ${fmtNum(s.nilai)}`])
    );
    wsSum.columns = [{ key: "label", width: 24 }, { key: "value", width: 48 }];

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="laporan-data-${today}.xlsx"`);
    logAudit({
      userId: req.user.id,
      action: "export",
      module: "export",
      description: `Mengekspor ${rows.length} data ke file Excel`,
      newData: { type: "excel", rows: rows.length, filters: req.query || {} },
      req,
    });
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

app.get("/api/export/pdf", async (req, res, next) => {
  try {
    const { whereSql, params } = buildDataFilter(req.query);
    const [rows] = await pool.query(
      `SELECT d.id, d.kode, d.nama, d.jumlah, d.harga, d.tanggal, d.status, d.keterangan, k.nama_kategori
       FROM data_barang d LEFT JOIN kategori k ON k.id = d.kategori_id
       ${whereSql}
       ORDER BY d.tanggal DESC, d.id DESC`,
      params
    );
    const [[sum]] = await pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(jumlah),0) AS j, COALESCE(SUM(jumlah*harga),0) AS v
       FROM data_barang d ${whereSql}`,
      params
    );

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="laporan-data-${today}.pdf"`);
    logAudit({
      userId: req.user.id,
      action: "export",
      module: "export",
      description: `Mengekspor ${rows.length} data ke file PDF`,
      newData: { type: "pdf", rows: rows.length, filters: req.query || {} },
      req,
    });
    doc.pipe(res);

    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#4c1d95").text("LAPORAN DATA PENGOLAHAN INPUT OUTPUT", { align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(`Dicetak: ${today}`, { align: "center" });
    doc.moveDown(0.8);

    const statBox = (label, value, x, w) => {
      doc.roundedRect(x, doc.y, w, 40, 6).fill("#ede9fe");
      doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(11).text(String(value), x + 10, doc.y + 7, { width: w - 20, align: "left" });
      doc.fillColor("#6b7280").font("Helvetica").fontSize(7.5).text(label, x + 10, doc.y + 24, { width: w - 20 });
    };
    const sx = doc.page.margins.left;
    const sw = W / 3;
    statBox("TOTAL DATA", `${fmtNum(sum.n)}`, sx, sw - 8);
    statBox("TOTAL JUMLAH", `${fmtNum(sum.j)}`, sx + sw, sw - 8);
    statBox("TOTAL NILAI", fmtRp(sum.v), sx + sw * 2, sw - 8);
    doc.moveDown(2.4);

    const drawTable = (title, headers, colWidths, rowsData) => {
      const rowHeight = 18;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(title);
      doc.moveDown(0.3);
      let cy = doc.y;
      let totalW = colWidths.reduce((a, b) => a + b, 0);
      let ox = doc.page.margins.left + (W - totalW) / 2;
      const cellY = () => cy + 3;
      headers.forEach((h, i) => {
        const cx = ox + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.rect(cx, cy, colWidths[i], rowHeight).fill("#6d28d9");
      });
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
      headers.forEach((h, i) => {
        const cx = ox + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(h, cx + 4, cellY(), { width: colWidths[i] - 6, height: rowHeight - 2, lineBreak: false });
      });
      cy += rowHeight;
      doc.font("Helvetica").fontSize(7.5);
      rowsData.forEach((r, ri) => {
        if (cy + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          cy = doc.page.margins.top;
        }
        if (ri % 2 === 1) doc.rect(ox, cy, totalW, rowHeight).fill("#f1f5f9");
        r.forEach((cell, i) => {
          const cx = ox + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
          doc.fillColor("#1e293b").text(String(cell), cx + 4, cellY(), {
            width: colWidths[i] - 6,
            height: rowHeight - 2,
            lineBreak: false,
            ellipsis: true,
          });
        });
        cy += rowHeight;
      });
      doc.y = cy;
      doc.moveDown(0.8);
    };

    drawTable(
      "RINGKASAN PER STATUS",
      ["Status", "Jumlah Item", "Total Jumlah", "Total Nilai"],
      [(W * 3) / 10, (W * 2) / 10, (W * 2) / 10, (W * 3) / 10],
      [
        ["Masuk", sum.n, sum.j, fmtRp(sum.v)],
        ...rows.map((r) => [r.status, 1, r.jumlah, fmtRp(Number(r.jumlah) * Number(r.harga))]),
      ]
    );

    drawTable(
      "DETAIL DATA",
      ["Kode", "Nama", "Kategori", "Jumlah", "Harga", "Total", "Tanggal", "Status"],
      [(W * 1) / 12, (W * 2.2) / 12, (W * 1.6) / 12, (W * 1) / 12, (W * 1.7) / 12, (W * 1.9) / 12, (W * 1.2) / 12, (W * 1.4) / 12],
      rows.map((r) => [r.kode, r.nama, r.nama_kategori || "-", fmtNum(r.jumlah), fmtRp(r.harga), fmtRp(Number(r.jumlah) * Number(r.harga)), fmtDate(r.tanggal), r.status])
    );

    doc.end();
  } catch (err) {
    next(err);
  }
});

app.get("/api/export/template", async (_req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "SISNERLING";
    const ws = wb.addWorksheet("Template Input Output");
    ws.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Kode", key: "kode", width: 12 },
      { header: "Nama", key: "nama", width: 26 },
      { header: "Kategori", key: "kategori", width: 16 },
      { header: "Jumlah", key: "jumlah", width: 10 },
      { header: "Harga", key: "harga", width: 16 },
      { header: "Tanggal", key: "tanggal", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Keterangan", key: "keterangan", width: 32 },
    ];
    ws.addRow({ no: 1, kode: "BRG-100", nama: "Contoh Aset Mineral", kategori: "Neraca Aset Mineral & Energi", jumlah: 10, harga: 100000, tanggal: "2026-08-13", status: "Masuk", keterangan: "Contoh isian" });
    ws.addRow({ no: 2, kode: "BRG-101", nama: "Contoh Aset Terintegrasi", kategori: "Neraca Terintegrasi", jumlah: 5, harga: 250000, tanggal: "2026-08-13", status: "Keluar", keterangan: "" });
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;
    ws.getColumn(6).numFmt = '"Rp" #,##0';
    ws.views = [{ state: "frozen", ySplit: 1 }];

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="template-input-output.xlsx"`);
    logAudit({
      userId: req.user.id,
      action: "export",
      module: "export",
      description: "Mengekspor template Excel input-output",
      newData: { type: "template" },
      req,
    });
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// Auto-daftarkan hasil import sebagai sheet server (spreadsheet) beserta
// kolomnya, lalu ikat baris hasil import (sheet_id) supaya sheet langsung
// muncul di halaman Penugasan Tabel dan bisa ditugaskan ke admin.
async function registerSheetForImport(pool, req, { nama, kolom, kodes, sumberFile }) {
  if (!Array.isArray(kodes) || kodes.length === 0) return null;
  const DEF_KOLOM = [
    "kode", "nama", "kategori_id", "jumlah", "harga", "total", "tanggal", "status", "keterangan",
  ].map((k) => {
    const cfg =
      { kode: { label: "Kode", type: "text", width: 110 }, nama: { label: "Nama", type: "text", width: 200 },
        kategori_id: { label: "Kategori", type: "select", width: 130 }, jumlah: { label: "Jumlah", type: "number", width: 100 },
        harga: { label: "Harga", type: "number", width: 130, format: "rupiah" }, total: { label: "Total", type: "number", width: 150, format: "rupiah" },
        tanggal: { label: "Tanggal", type: "date", width: 130 }, status: { label: "Status", type: "select", width: 120 },
        keterangan: { label: "Keterangan", type: "text", width: 240 } }[k] || {};
    return { key: k, label: cfg.label || k, type: cfg.type || "text", width: cfg.width || 140, ...(cfg.format ? { format: cfg.format } : {}), visible: true };
  });
  const useKolom = Array.isArray(kolom) && kolom.length ? kolom : DEF_KOLOM;
  const kolomJson = JSON.stringify(useKolom);
  let sheetName = String(nama || "Import").trim().replace(/\.[^.]+$/, "").slice(0, 150);
  if (!sheetName) sheetName = "Import";
let result = null;
      // Reuse baris yang sudah ada untuk identitas sheet yang sama, agar
      // publish/import ulang TIDAK membuat duplikat "(2)","(3)" di database.
      const [[existSp]] = await pool.query(
        "SELECT id FROM spreadsheet WHERE (sumber_file = ? OR (sumber_file IS NULL AND ? IS NULL)) AND nama = ?",
        [sumberFile || null, sumberFile || null, sheetName]
      );
      if (existSp && existSp.id) {
        await pool.query("UPDATE spreadsheet SET kolom = ? WHERE id = ?", [kolomJson, existSp.id]);
        result = { insertId: existSp.id };
      } else {
        try {
          [result] = await pool.query("INSERT INTO spreadsheet (nama, sumber_file, kolom) VALUES (?, ?, ?)", [sheetName, sumberFile || null, kolomJson]);
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY") {
            const [[dup]] = await pool.query(
              "SELECT id FROM spreadsheet WHERE (sumber_file = ? OR (sumber_file IS NULL AND ? IS NULL)) AND nama = ?",
              [sumberFile || null, sumberFile || null, sheetName]
            );
            if (dup && dup.id) result = { insertId: dup.id };
            else throw err;
          } else {
            throw err;
          }
        }
      }
      if (!result) return null;
      const sheetId = result.insertId;
  const kodesList = Array.from(new Set(kodes));
  for (let i = 0; i < kodesList.length; i += 500) {
    const chunk = kodesList.slice(i, i + 500);
    const ph = chunk.map(() => "?").join(",");
    await pool.query(`UPDATE data_barang SET sheet_id = ? WHERE kode IN (${ph})`, [sheetId, ...chunk]);
  }
  logAudit({
    userId: req.user.id,
    action: "create",
    module: "spreadsheet",
    description: `Import file otomatis membuat sheet "${sheetName}" (${kodesList.length} baris)`,
    recordId: sheetId,
    newData: { nama: sheetName, dariImport: true, jumlahBaris: kodesList.length, kolom: useKolom },
    req,
  });
  return { id: sheetId, nama: sheetName };
}

// =====================================================================
// Publish file dari halaman Spreadsheet (Excel Editor, tersimpan di
// browser) ke server sebagai sheet yang bisa ditugaskan ke admin.
// Masing-masing worksheet file dijadikan satu spreadsheet (nama unik),
// barisnya diikat via sheet_id. Tanpa kategori; kolom dibentuk dari baris
// header tiap sheet (alias standar dikenali, sisanya kimportN).
// =====================================================================
app.post("/api/import/workbook", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { base64 } = req.body || {};
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "File Excel tidak ditemukan" });
    }
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) return res.status(400).json({ error: "File kosong atau tidak valid" });

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      return res.status(400).json({ error: "File bukan format Excel (.xlsx) yang valid" });
    }
    const wsList = wb.worksheets;
    if (!wsList.length) return res.status(400).json({ error: "File tidak memiliki worksheet" });

    const fileStem = String(req.body.filename || "Spreadsheet").trim().replace(/\.[^.]+$/, "").slice(0, 120) || "Spreadsheet";
    const fileToken = fileStem.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() || "imp";

    // ---- helper ringkas (selaras dengan /api/import/excel) ----
    const pad2 = (n) => String(n).padStart(2, "0");
    const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const toNum = (s) => {
      const n = Number(String(s ?? "").replace(/[Rp\s.]/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };
    const clampInt = (n) => Math.max(0, Math.min(Number(n) || 0, 9999999999));
    const isFiniteNumber = (x) => typeof x === "number" && Number.isFinite(x);
    const isNumericLike = (s) => {
      const t = String(s).trim();
      if (t === "") return false;
      return /^[-+]?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t) || Number(t.replace(/[Rp\s.]/g, "").replace(",", ".")) !== 0 ||
        /^[-+]?\d+(\.\d+)?$/.test(t);
    };
    const isDateLike = (s) => {
      const t = String(s).trim();
      if (!t || /^-?\d+$/.test(t)) return false;
      return !Number.isNaN(Date.parse(t)) || /^\d{4}-\d{2}-\d{2}$/.test(t) || /^\d{2}[/-]\d{2}[/-]\d{4}$/.test(t);
    };
    const colToNameSrv = (n) => {
      let x = n;
      let s = "";
      while (x > 0) {
        const m = (x - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        x = Math.floor((x - 1) / 26);
      }
      return s;
    };
    const roundValue = (num, cell) => {
      const fmt = cell && cell.numFmt ? String(cell.numFmt) : "";
      if (/^(0|#|[0]\.0)/.test(fmt)) return Math.round(num);
      if (fmt.includes("0.00")) return Math.round(num * 100) / 100;
      if (fmt.includes("0.0")) return Math.round(num * 10) / 10;
      return Math.round(num * 100) / 100;
    };
    const shiftFormulaRefs = (f, dr, dc) =>
      String(f).replace(/(\$?)([A-Za-z]+)(\$?)(\d+)/g, (_m, cd, cl, rd, rw) => {
        let c = 0;
        for (const ch of cl.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
        c = Math.max(1, c + dc);
        const r2 = Math.max(1, parseInt(rw, 10) + dr);
        return `${cd}${colToNameSrv(c)}${rd}${r2}`;
      });
    const translateFormula = (f, offset) => {
      const s = String(f || "").replace(/^=/, "");
      return (
        "=" +
        s.replace(/([A-Za-z]+)(\d+)/g, (m, col, rowStr) => {
          const gr = parseInt(rowStr, 10) - offset + 1;
          return gr >= 1 ? `${col}${gr}` : `${col}`;
        })
      );
    };
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    // Master rumus berantai & pembaca sel per sheet (diisi tiap iterasi).
    let masters = new Map();
    const cellRaw = (cell, m) => {
      const v = cell.value;
      if (v === null || v === undefined) return { value: "", formula: null };
      if (typeof v === "object") {
        if (Array.isArray(v.richText)) return { value: v.richText.map((r) => r.text || "").join("").trim(), formula: null };
        if ("text" in v && "hyperlink" in v) return { value: String(v.text ?? "").trim(), formula: null };
        if (typeof v.formula === "string") {
          const r = v.result;
          const val =
            r === undefined || r === null
              ? ""
              : r instanceof Date
                ? fmtDate(r)
                : isFiniteNumber(r)
                  ? roundValue(r, cell)
                  : String(r).trim();
          return { value: val === "" ? "" : String(val).trim(), formula: v.formula };
        }
        if (typeof v.sharedFormula === "string") {
          const master = m.get(v.sharedFormula);
          if (master && typeof cell.row === "number" && typeof cell.col === "number") {
            const shifted = shiftFormulaRefs(master.f, cell.row - master.row, cell.col - master.col);
            const r = v.result;
            const val =
              r === undefined || r === null
                ? ""
                : r instanceof Date
                  ? fmtDate(r)
                  : isFiniteNumber(r)
                    ? roundValue(r, cell)
                    : String(r).trim();
            return { value: val === "" ? "" : String(val).trim(), formula: shifted };
          }
        }
        if ("result" in v) {
          const r = v.result;
          return {
            value: r === null || r === undefined ? "" : isFiniteNumber(r) ? String(roundValue(r, cell)).trim() : String(r).trim(),
            formula: null,
          };
        }
        return { value: String(v).trim(), formula: null };
      }
      if (isFiniteNumber(v)) return { value: String(roundValue(v, cell)).trim(), formula: null };
      return { value: v instanceof Date ? fmtDate(v) : String(v).trim(), formula: null };
    };
    const HEADER_MAP = {
      kode: "kode", "kode barang": "kode", "kode item": "kode", "kode aset": "kode", "kode data": "kode",
      "kode inventaris": "kode", no: "kode", nomor: "kode",
      nama: "nama", "nama data": "nama", "nama barang": "nama", "nama item": "nama", "nama aset": "nama",
      uraian: "nama", kategori: "kategori", "kategori neraca": "kategori", neraca: "kategori", jenis: "kategori",
      jumlah: "jumlah", qty: "jumlah", "total jumlah": "jumlah", kuantitas: "jumlah", volume: "jumlah",
      harga: "harga", "harga satuan": "harga", "harga unit": "harga", nilai: "harga", "nilai satuan": "harga",
      total: "total", "total nilai": "total", "nilai total": "total", "jumlah total": "total",
      tanggal: "tanggal", date: "tanggal", tgl: "tanggal", "tanggal input": "tanggal",
      status: "status", state: "status",
      keterangan: "keterangan", ket: "keterangan", catatan: "keterangan", info: "keterangan", lokasi: "keterangan",
    };
    const aliasMap = new Map();
    for (const [label, key] of Object.entries(HEADER_MAP)) {
      aliasMap.set(norm(label), { key, standard: true, customKey: key });
    }
    const matchAlias = (cellValue) => {
      const t = norm(cellValue);
      if (!t) return null;
      const direct = aliasMap.get(t);
      if (direct) return direct;
      let best = null;
      for (const [alias, mapped] of aliasMap) {
        if (alias.length >= 4 && t.includes(alias) && (!best || alias.length > best.len)) {
          best = { mapped, len: alias.length };
        }
      }
      return best ? best.mapped : null;
    };
    const STD_SHEET_KEYS = new Set(["kode", "nama", "jumlah", "harga", "total", "tanggal", "status", "keterangan"]);

    const detectType = (ws, headerRow, colNum) => {
      let num = 0;
      let dt = 0;
      let tot = 0;
      const end = Math.min(ws.rowCount, headerRow + 300);
      for (let r = headerRow + 1; r <= end; r++) {
        const cv = cellRaw(ws.getRow(r).getCell(colNum), masters).value;
        if (cv === "") continue;
        tot++;
        if (isNumericLike(cv)) num++;
        else if (isDateLike(cv)) dt++;
      }
      return tot === 0 ? "text" : num / tot >= 0.6 ? "number" : dt / tot >= 0.5 ? "date" : "text";
    };

    const [[{ cnt: totalRows }]] = await pool.query("SELECT COUNT(*) AS cnt FROM data_barang");
    let gridRow = Number(totalRows) || 0;
    const results = { sheets: [], inserted: 0, updated: 0, skipped: 0, errors: [] };
    let seq = 0;

    for (let wi = 0; wi < wsList.length; wi++) {
      const ws = wsList[wi];
      const hiddenFlag = ws.state === "hidden" || ws.state === "veryHidden" ? 1 : 0;
      let maxCol = 0;
      for (let r = 1; r <= Math.min(ws.rowCount, 300); r++) {
        ws.getRow(r).eachCell({ includeEmpty: false }, (_c, colNum) => {
          if (colNum > maxCol) maxCol = colNum;
        });
      }
      const isEmpty = maxCol === 0;

      // Isi master rumus berantai per sheet (mirip import).
      masters = new Map();
      if (!isEmpty) {
        try {
          const mscanEnd = Math.min(ws.rowCount, 500);
          for (let r = 1; r <= mscanEnd; r++) {
            ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
              const v = cell.value;
              if (v && typeof v === "object" && !Array.isArray(v.richText) && typeof v.formula === "string") {
                masters.set(cell.address, { f: v.formula, row: cell.row, col: cell.col });
              }
            });
          }
        } catch (_e) {}
      }

      // Baris header pertama dengan >= 2 sel terisi, dibatasi 15 baris pertama.
      let inputHeaderRow = 0;
      for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
        let n = 0;
        ws.getRow(r).eachCell({ includeEmpty: false }, () => n++);
        if (n >= 2) {
          inputHeaderRow = r;
          break;
        }
      }
      const hr = inputHeaderRow || 1;

      const plan = [];
      const planByCol = new Map();
      const usedStd = new Set();
      if (!isEmpty && inputHeaderRow > 0) {
        ws.getRow(hr).eachCell({ includeEmpty: false }, (cell, c) => {
          const label = String(cell.value ?? "").trim().slice(0, 40) || `Kolom ${c}`;
          const m = matchAlias(cell.value);
          const stdKey = m ? m.key : null;
          const standard = !!(m && m.standard && m.key !== "kategori" && STD_SHEET_KEYS.has(m.key) && !usedStd.has(m.key));
          const key = standard ? stdKey : `kimport${c}`;
          if (standard) usedStd.add(key);
          const entry = { key, col: c, label, standard, type: detectType(ws, hr, c) };
          plan.push(entry);
          planByCol.set(c, entry);
        });
      } else if (!isEmpty) {
        for (let c = 1; c <= maxCol; c++) {
          const entry = { key: `kimport${c}`, col: c, label: `Kolom ${c}`, standard: false, type: "text" };
          plan.push(entry);
          planByCol.set(c, entry);
        }
      }

      const kolomConfig = plan.length
        ? plan.map((p) => ({ key: p.key, label: p.label, type: p.type, width: 140, visible: true }))
        : [{ key: "kimport1", label: "Kolom 1", type: "text", width: 140, visible: true }];

      // Nama sheet: identitas ASLI worksheet dari workbook (single source of
      // truth). Publikasi ulang file yang sama TIDAK membuat sheet baru
      // "(2)","(3)" — baris yang sama dipakai ulang (upsert by identity:
      // (sumber_file, worksheet_index), fallback (sumber_file, nama)).
      const isMulti = wsList.length > 1;
      const sheetBase = isMulti
        ? `${fileStem}@${(String(ws.name || "").trim() || `Sheet ${wi + 1}`).slice(0, 60)}`
        : fileStem;
      const kolomJsonPublish = JSON.stringify(kolomConfig);
      let spRow = null;
      let sheetName = sheetBase;
      const [[existByIdx]] = await pool.query(
        "SELECT id, nama FROM spreadsheet WHERE sumber_file = ? AND worksheet_index = ?",
        [fileStem, wi]
      );
      if (existByIdx && existByIdx.id) {
        sheetName = existByIdx.nama || sheetBase;
      } else {
        const [[existByName]] = await pool.query(
          "SELECT id, nama FROM spreadsheet WHERE sumber_file = ? AND nama = ?",
          [fileStem, sheetBase]
        );
        if (existByName && existByName.id) {
          sheetName = existByName.nama || sheetBase;
        }
      }
      const [[existSp]] = await pool.query(
        "SELECT id FROM spreadsheet WHERE sumber_file = ? AND nama = ?",
        [fileStem, sheetName]
      );
      if (existSp && existSp.id) {
        await pool.query("UPDATE spreadsheet SET kolom = ?, worksheet_index = ?, hidden = ? WHERE id = ?", [kolomJsonPublish, wi, hiddenFlag, existSp.id]);
        spRow = { id: existSp.id };
      } else {
        try {
          const [r] = await pool.query(
            "INSERT INTO spreadsheet (nama, sumber_file, kolom, worksheet_index, hidden) VALUES (?, ?, ?, ?, ?)",
            [sheetName, fileStem, kolomJsonPublish, wi, hiddenFlag]
          );
          spRow = { id: r.insertId };
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY") {
            const [[dup]] = await pool.query(
              "SELECT id FROM spreadsheet WHERE sumber_file = ? AND nama = ?",
              [fileStem, sheetName]
            );
            if (dup && dup.id) {
              await pool.query("UPDATE spreadsheet SET kolom = ?, worksheet_index = ?, hidden = ? WHERE id = ?", [kolomJsonPublish, wi, hiddenFlag, dup.id]);
              spRow = { id: dup.id };
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }
      if (!spRow) continue;
      const sheetId = spRow.id;

      let ins = 0;
      for (let r = hr + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const values = {};
        const nilai = {};
        const fm = {};
        let any = false;
        const rowOffset = r - gridRow;
        for (let c = 1; c <= maxCol; c++) {
          const { value, formula } = cellRaw(row.getCell(c), masters);
          if (value === "" && !formula) continue;
          any = true;
          const entry = planByCol.get(c);
          if (!entry) continue;
          let cellVal = value;
          let gridFormula = null;
          if (formula) {
            if (/[![\]]/.test(formula)) {
              cellVal = "";
            } else {
              gridFormula = translateFormula(formula, rowOffset);
              if (entry.key === "total") fm.total = gridFormula;
              else if (entry.standard) fm[entry.key] = gridFormula;
              else cellVal = gridFormula;
            }
          }
          if (entry.key === "total") {
            fm.total = gridFormula || cellVal;
            continue;
          }
          if (entry.standard) values[entry.key] = cellVal;
          else if (cellVal !== "") nilai[entry.key] = cellVal;
        }
        if (!any) continue;

        let kode = String(values.kode || "").trim().slice(0, 50);
        const nama = String(values.nama || "").trim().slice(0, 150) || `Baris ${r}`;
        if (!kode) kode = `${fileToken}-${String(Date.now()).slice(-6)}-${String(++seq).padStart(3, "0")}`;
        const jumlah = clampInt(toNum(values.jumlah));
        const harga = Math.min(toNum(values.harga), 9999999999999.99);
        let tanggal = String(values.tanggal || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) tanggal = new Date().toISOString().slice(0, 10);
        let status = String(values.status || "").trim();
        if (!["Masuk", "Keluar", "Pending"].includes(status)) status = "Pending";
        const keterangan = String(values.keterangan || "").trim() || null;
        const fmJson = Object.keys(fm).length ? fm : null;
        const nilaiJson = Object.keys(nilai).length ? nilai : null;

        try {
          await pool.query(
            `INSERT INTO data_barang (kode, nama, kategori_id, sheet_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai)
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              kode,
              nama,
              sheetId,
              jumlah,
              harga,
              tanggal,
              status,
              keterangan,
              fmJson ? JSON.stringify(fmJson) : null,
              nilaiJson ? JSON.stringify(nilaiJson) : null,
            ]
          );
          ins++;
          results.inserted++;
          gridRow++;
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY") {
            results.skipped++;
            results.errors.push(`Sheet "${sheetName}" baris ${r}: Kode "${kode}" sudah ada`);
          } else {
            results.skipped++;
            results.errors.push(`Sheet "${sheetName}" baris ${r}: ${err.message}`);
          }
        }
      }

      results.sheets.push({ sheetId, sheetName, rows: ins });
    }

    if (!results.sheets.length) {
      return res.status(400).json({ error: "Tidak ada data yang bisa dipublikasikan", ...results });
    }
    logAudit({
      userId: req.user.id,
      action: "import",
      module: "spreadsheet",
      description: `Publikasi file "${(req.body && req.body.filename) || fileStem}" → ${results.sheets.length} sheet (${results.inserted} baris, ${results.skipped} skip)`,
      newData: { filename: (req.body && req.body.filename) || fileStem, ...results },
      req,
    });
    res.json({ message: "Publikasi ke server selesai", ...results });
  } catch (err) {
    next(err);
  }
});

app.post("/api/import/excel", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { base64, kategoriId, columns } = req.body || {};
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "File Excel tidak ditemukan" });
    }
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) {
      return res.status(400).json({ error: "File kosong atau tidak valid" });
    }

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch (err) {
      return res
        .status(400)
        .json({ error: "File bukan format Excel (.xlsx) yang valid. Simpan file sebagai .xlsx (bukan .xls atau CSV)." });
    }
    let ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: "File tidak memiliki worksheet" });
    if (ws.actualColumnCount === 0) {
      ws = wb.worksheets.find((s) => s.actualColumnCount > 0) || null;
      if (!ws) return res.status(400).json({ error: "File tidak memiliki data di worksheet mana pun" });
    }

    // Excel menyimpan rumus berantai (shared formula) hanya di sel induk;
    // kumpulkan induknya agar rumus pada sel lain bisa direkonstruksi.
    const sharedMasters = new Map();
    try {
      const mscanEnd = Math.min(ws.rowCount, 500);
      for (let r = 1; r <= mscanEnd; r++) {
        ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
          const v = cell.value;
          if (v && typeof v === "object" && !Array.isArray(v.richText) && typeof v.formula === "string") {
            sharedMasters.set(cell.address, { f: v.formula, row: cell.row, col: cell.col });
          }
        });
      }
    } catch (_e) {}

    const colToNameSrv = (n) => {
      let x = n;
      let s = "";
      while (x > 0) {
        const m = (x - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        x = Math.floor((x - 1) / 26);
      }
      return s;
    };
    const shiftFormulaRefs = (f, dr, dc) =>
      String(f).replace(/(\$?)([A-Za-z]+)(\$?)(\d+)/g, (_m, cd, cl, rd, rw) => {
        let c = 0;
        for (const ch of cl.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
        c = Math.max(1, c + dc);
        const r2 = Math.max(1, parseInt(rw, 10) + dr);
        return `${cd}${colToNameSrv(c)}${rd}${r2}`;
      });

    const STANDARD_KEYS_SERVER = ["kode", "nama", "kategori", "jumlah", "harga", "tanggal", "status", "keterangan"];
    const HEADER_MAP = {
      kode: "kode",
      "kode barang": "kode",
      "kode item": "kode",
      "kode aset": "kode",
      "kode data": "kode",
      "kode inventaris": "kode",
      no: "kode",
      nomor: "kode",
      nama: "nama",
      "nama data": "nama",
      "nama barang": "nama",
      "nama item": "nama",
      "nama aset": "nama",
      uraian: "nama",
      kategori: "kategori",
      "kategori neraca": "kategori",
      neraca: "kategori",
      jenis: "kategori",
      jumlah: "jumlah",
      qty: "jumlah",
      "total jumlah": "jumlah",
      kuantitas: "jumlah",
      volume: "jumlah",
      harga: "harga",
      "harga satuan": "harga",
      "harga unit": "harga",
      nilai: "harga",
      "nilai satuan": "harga",
      total: "total",
      "total nilai": "total",
      "nilai total": "total",
      "jumlah total": "total",
      tanggal: "tanggal",
      date: "tanggal",
      tgl: "tanggal",
      "tanggal input": "tanggal",
      status: "status",
      state: "status",
      keterangan: "keterangan",
      ket: "keterangan",
      catatan: "keterangan",
      info: "keterangan",
      lokasi: "keterangan",
    };

    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

    const aliasMap = new Map();
    for (const [label, key] of Object.entries(HEADER_MAP)) {
      aliasMap.set(norm(label), { key, standard: true, customKey: key });
    }
    const addAlias = (label, key) => {
      const t = norm(label);
      if (!t) return;
      if (key === "total") return;
      if (key === "kategori_id") {
        aliasMap.set(t, { key: "kategori", standard: true, customKey: "kategori" });
        return;
      }
      aliasMap.set(t, {
        key,
        standard: STANDARD_KEYS_SERVER.includes(key),
        customKey: key,
      });
    };

    const [kategoriRows] = await pool.query("SELECT id, nama_kategori, kolom FROM kategori");
    const katById = new Map(kategoriRows.map((k) => [String(k.id), k]));
    const katByName = new Map(kategoriRows.map((k) => [k.nama_kategori.toLowerCase(), k.id]));

    if (Array.isArray(columns) && columns.length) {
      for (const c of columns) if (c && c.label) addAlias(c.label, c.key);
    }
    const targetKat = kategoriId ? katById.get(String(kategoriId)) : null;
    if (targetKat && Array.isArray(targetKat.kolom)) {
      for (const c of targetKat.kolom) if (c && c.label) addAlias(c.label, c.key);
    }

    // Baris data yang sudah ada sebelum import: rumus digeser relatif
    // terhadap posisi baris pertama hasil import pada grid.
    let effTargetId = targetKat ? targetKat.id : null;
    if (!effTargetId) {
      const [fk] = await pool.query("SELECT id FROM kategori ORDER BY id ASC LIMIT 1");
      if (fk.length) effTargetId = fk[0].id;
    }
    let baseRows = 0;
    if (effTargetId != null) {
      const [[cntRow]] = await pool.query(
        "SELECT COUNT(*) AS cnt FROM data_barang WHERE kategori_id = ?",
        [effTargetId]
      );
      baseRows = Number(cntRow.cnt) || 0;
    }

    const matchAlias = (cellValue) => {
      const t = norm(cellValue);
      if (!t) return null;
      if (aliasMap.has(t)) return aliasMap.get(t);
      let best = null;
      for (const [alias, mapped] of aliasMap) {
        if (alias.length >= 4 && t.includes(alias) && (!best || alias.length > best.len)) {
          best = { mapped, len: alias.length };
        }
      }
      return best ? best.mapped : null;
    };

    let headerRowNum = 0;
    let headerScore = 0;
    const scanLimit = Math.min(15, ws.rowCount);
    for (let r = 1; r <= scanLimit; r++) {
      const keys = new Set();
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        const m = matchAlias(cell.value ?? "");
        if (m) keys.add(m.key);
      });
      if (keys.size >= 2 && keys.size > headerScore) {
        headerScore = keys.size;
        headerRowNum = r;
      }
    }

    const colMap = {};
    const customCols = {};
    const customLabels = {};
    if (headerRowNum > 0) {
      ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
        const m = matchAlias(cell.value ?? "");
        if (!m) return;
        if (m.standard) {
          if (colMap[m.key] === undefined) colMap[m.key] = colNum;
        } else if (customCols[m.customKey] === undefined) {
          customCols[m.customKey] = colNum;
          const lbl = String(cell.value ?? "").trim();
          customLabels[m.customKey] = lbl || m.customKey;
        }
      });
    }

    const toNum = (s) => {
      const n = Number(String(s).replace(/[Rp\s.]/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };
    const today = new Date().toISOString().slice(0, 10);

    const clampInt = (n) => {
      if (!Number.isFinite(n)) return 0;
      const LIMIT = 9007199254740991;
      if (n > LIMIT) return LIMIT;
      if (n < -LIMIT) return -LIMIT;
      return Math.round(n);
    };

    if (headerRowNum > 0) {
      let fileMaxCol = 0;
      for (let r = 1; r <= Math.min(ws.rowCount, 300); r++) {
        ws.getRow(r).eachCell({ includeEmpty: false }, (cell, colNum) => {
          if (colNum > fileMaxCol) fileMaxCol = colNum;
        });
      }
      const mapped = new Set();
      for (const ci of Object.values(colMap)) mapped.add(ci);
      for (const ci of Object.values(customCols)) mapped.add(ci);
      if (fileMaxCol > 2 && mapped.size < fileMaxCol / 2) {
        console.log(`[IMPORT] header lemah (${mapped.size}/${fileMaxCol} kolom terpetakan), lanjut deteksi adaptif`);
        headerRowNum = 0;
      }
    }

    const isNumericLike = (s) => {
      const t = String(s ?? "").trim();
      if (t === "") return false;
      const n = Number(t.replace(/[Rp\s.]/g, "").replace(",", "."));
      return Number.isFinite(n);
    };
    const isDateLike = (s) => {
      const t = String(s ?? "").trim();
      return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(t) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(t);
    };
    const numFmtInfo = (fmt) => {
      if (typeof fmt !== "string" || fmt === "" || /^general$/i.test(fmt)) return null;
      const pct = fmt.includes("%");
      const dot = fmt.lastIndexOf(".");
      let dec = 0;
      if (dot !== -1) {
        for (let i = dot + 1; i < fmt.length; i++) {
          const ch = fmt[i];
          if (ch === "0" || ch === "#") dec++;
          else break;
        }
      }
      return { dec, pct };
    };
    const roundValue = (num, cell) => {
      const info = numFmtInfo(cell.numFmt);
      if (info === null) return num;
      const n = info.pct ? num * 100 : num;
      const f = Math.pow(10, info.dec);
      return Math.round(n * f) / f;
    };
    const isFiniteNumber = (x) => typeof x === "number" && Number.isFinite(x);
    const cellRaw = (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) return { value: "", formula: null };
      if (typeof v === "object") {
        if (Array.isArray(v.richText)) {
          return { value: v.richText.map((r) => r.text || "").join("").trim(), formula: null };
        }
        if ("text" in v && "hyperlink" in v) {
          return { value: String(v.text ?? "").trim(), formula: null };
        }
        if (typeof v.formula === "string") {
          const r = v.result;
          const val =
            r === undefined || r === null
              ? ""
              : r instanceof Date
                ? fmtDate(r)
                : isFiniteNumber(r)
                  ? roundValue(r, cell)
                  : String(r).trim();
          return { value: val === "" ? "" : String(val).trim(), formula: v.formula };
        }
        if (typeof v.sharedFormula === "string") {
          const master = sharedMasters.get(v.sharedFormula);
          if (master && typeof cell.row === "number" && typeof cell.col === "number") {
            const shifted = shiftFormulaRefs(master.f, cell.row - master.row, cell.col - master.col);
            const r = v.result;
            const val =
              r === undefined || r === null
                ? ""
                : r instanceof Date
                  ? fmtDate(r)
                  : isFiniteNumber(r)
                    ? roundValue(r, cell)
                    : String(r).trim();
            return { value: val === "" ? "" : String(val).trim(), formula: shifted };
          }
        }
        if ("result" in v) {
          const r = v.result;
          return {
            value: r === null || r === undefined ? "" : isFiniteNumber(r) ? String(roundValue(r, cell)).trim() : String(r).trim(),
            formula: null,
          };
        }
        return { value: String(v).trim(), formula: null };
      }
      if (isFiniteNumber(v)) return { value: String(roundValue(v, cell)).trim(), formula: null };
      return { value: v instanceof Date ? fmtDate(v) : String(v).trim(), formula: null };
    };
    const translateFormula = (f, offset) => {
      const s = String(f || "").replace(/^=/, "");
      const out = s.replace(/([A-Za-z]+)(\d+)/g, (m, col, rowStr) => {
        const gr = parseInt(rowStr, 10) - offset + 1;
        return gr >= 1 ? `${col}${gr}` : `${col}`;
      });
      return "=" + out;
    };
    const STD_CFG = {
      kode: { label: "Kode", type: "text", width: 110 },
      nama: { label: "Nama", type: "text", width: 200 },
      kategori_id: { label: "Kategori", type: "select", width: 130 },
      jumlah: { label: "Jumlah", type: "number", width: 100 },
      harga: { label: "Harga", type: "number", width: 130, format: "rupiah" },
      total: { label: "Total", type: "number", width: 150, format: "rupiah" },
      tanggal: { label: "Tanggal", type: "date", width: 130 },
      status: { label: "Status", type: "select", width: 120 },
      keterangan: { label: "Keterangan", type: "text", width: 240 },
    };

    // ===== Mode header terpetakan: pastikan SEMUA kolom file ikut, urut
    // sesuai file agar huruf rumus (A, B, C, ...) tetap sejajar. =====
    let orderedCfg = null;
    if (headerRowNum > 0) {
      const detectType = (colNum) => {
        let num = 0;
        let dt = 0;
        let tot = 0;
        const end = Math.min(ws.rowCount, headerRowNum + 300);
        for (let r = headerRowNum + 1; r <= end; r++) {
          const cv = cellRaw(ws.getRow(r).getCell(colNum)).value;
          if (cv === "") continue;
          tot++;
          if (isNumericLike(cv)) num++;
          else if (isDateLike(cv)) dt++;
        }
        return tot === 0 ? "text" : num / tot >= 0.6 ? "number" : dt / tot >= 0.5 ? "date" : "text";
      };
      const stdTaken = new Set(Object.values(colMap));
      const cusTaken = new Set(Object.values(customCols));
      ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
        if (stdTaken.has(colNum) || cusTaken.has(colNum)) return;
        const lbl = String(cell.value ?? "").trim();
        if (!lbl) return;
        const ck = `kimport${colNum}`;
        customCols[ck] = colNum;
        customLabels[ck] = lbl.slice(0, 40);
      });
      let mapMaxCol = 0;
      for (let r = 1; r <= Math.min(ws.rowCount, 300); r++) {
        ws.getRow(r).eachCell({ includeEmpty: false }, (_cell, colNum) => {
          if (colNum > mapMaxCol) mapMaxCol = colNum;
        });
      }
      orderedCfg = [];
      for (let c = 1; c <= mapMaxCol; c++) {
        const stdKey = Object.keys(colMap).find((k) => colMap[k] === c);
        if (stdKey) {
          const cfg = STD_CFG[stdKey] || {};
          orderedCfg.push({
            key: stdKey,
            label: cfg.label || stdKey,
            type: cfg.type || "text",
            width: cfg.width || 140,
            ...(cfg.format ? { format: cfg.format } : {}),
            visible: true,
          });
          continue;
        }
        const ck = Object.keys(customCols).find((k) => customCols[k] === c);
        if (ck) {
          orderedCfg.push({
            key: ck,
            label: customLabels[ck] || ck,
            type: detectType(c),
            width: 140,
            visible: true,
          });
        }
      }
      if (!orderedCfg.some((x) => x.key === "kode") && !orderedCfg.some((x) => x.key === "nama")) {
        // Tidak ada kolom Kode/Nama di file; tetap tampilkan apa adanya,
        // kode & nama akan dibuat otomatis dari isi baris.
      }
    }

    if (headerRowNum === 0) {
      let adaptHeader = 0;
      let adaptScore = 0;
      const scanEnd = Math.min(ws.rowCount, 300);
      for (let r = 1; r <= scanEnd; r++) {
        const row = ws.getRow(r);
        let score = 0;
        let yearCells = 0;
        let firstText = false;
        row.eachCell({ includeEmpty: false }, (cell, colNum) => {
          const { value } = cellRaw(cell);
          if (value === "") return;
          if (isNumericLike(value)) {
            const n = Number(value.replace(/[Rp\s.]/g, "").replace(",", "."));
            if (Number.isInteger(n) && n >= 1900 && n <= 2100) yearCells++;
          } else if (!isDateLike(value) && value.length <= 60) {
            score++;
            if (colNum === 1) firstText = true;
          }
        });
        if (firstText && yearCells >= 2 && row.actualCellCount >= 3) {
          adaptHeader = r;
          break;
        }
        if (score >= 2 && score > adaptScore) {
          adaptScore = score;
          adaptHeader = r;
        }
      }
      if (adaptHeader > 0) {
        let numericBelow = false;
        for (let r = adaptHeader + 1; r <= Math.min(adaptHeader + 10, ws.rowCount); r++) {
          ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
            if (isNumericLike(cellRaw(cell).value)) numericBelow = true;
          });
        }
        if (!numericBelow) adaptHeader = 0;
      }

      if (adaptHeader > 0) {
        let maxCol = 0;
        for (let r = 1; r <= ws.rowCount; r++) {
          ws.getRow(r).eachCell({ includeEmpty: false }, (cell, colNum) => {
            if (colNum > maxCol) maxCol = colNum;
          });
        }
        const plan = [];
        const usedStd = new Set();
        for (let c = 1; c <= maxCol; c++) {
          const { value } = cellRaw(ws.getRow(adaptHeader).getCell(c));
          const label = value !== "" ? String(value).trim().slice(0, 40) : `Kolom ${c}`;
          const m = value !== "" ? matchAlias(value) : null;
          const stdKey = m && m.key === "kategori" ? "kategori_id" : m && m.key;
          const standard = !!(m && m.standard && stdKey && !usedStd.has(stdKey));
          const key = standard ? stdKey : `kimport${c}`;
          if (standard) usedStd.add(stdKey);
          let numeric = 0;
          let dateLike = 0;
          let total = 0;
          for (let r = adaptHeader + 1; r <= ws.rowCount; r++) {
            const cv = cellRaw(ws.getRow(r).getCell(c)).value;
            if (cv === "") continue;
            total++;
            if (isNumericLike(cv)) numeric++;
            else if (isDateLike(cv)) dateLike++;
          }
          const type =
            total === 0 ? "text" : numeric / total >= 0.6 ? "number" : dateLike / total >= 0.5 ? "date" : "text";
          plan.push({ pos: c, key, standard, label, type });
        }

        const kolomConfig = [];
        for (const p of plan) {
          const cfg = STD_CFG[p.key] || {};
          kolomConfig.push({
            key: p.key,
            label: p.label,
            type: p.standard ? cfg.type || "text" : p.type,
            width: cfg.width || 140,
            ...(p.standard && cfg.format ? { format: cfg.format } : {}),
            visible: true,
          });
        }

        console.log(
          `[IMPORT] mulai file=${(req.body && req.body.filename) || "?"} MODE=ADAPTIF headerRow=${adaptHeader} kolom=${JSON.stringify(plan.map((p) => p.label))}`
        );

        const results = { inserted: 0, skipped: 0, errors: [], totalRows: 0 };
        const affectedKodes = [];
        let seq = 0;
        const offset = adaptHeader + 1;
        let gridRow = baseRows;
        for (let r = offset; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const rowOffset = r - gridRow;
          const values = {};
          const nilai = {};
          const fm = {};
          let any = false;
          for (let c = 1; c <= maxCol; c++) {
            const { value, formula } = cellRaw(row.getCell(c));
            if (value === "" && !formula) continue;
            any = true;
            const entry = plan[c - 1];
            if (!entry) continue;
            let cellVal = value;
            let gridFormula = null;
            if (formula) {
              if (/[![\]]/.test(formula)) {
                cellVal = "";
              } else {
                // Simpan rumus apa pun hasilnya agar tetap dihitung ulang di web.
                gridFormula = translateFormula(formula, rowOffset);
                if (entry.standard) fm[entry.key] = gridFormula;
                else cellVal = gridFormula;
              }
            }
            if (entry.key === "total") {
              fm.total = gridFormula || cellVal;
              continue;
            }
            if (entry.standard) values[entry.key] = cellVal;
            else if (cellVal !== "") nilai[entry.key] = cellVal;
          }
          if (!any) continue;
          results.totalRows++;

          let kode = String(values.kode || "").trim().slice(0, 50);
          const nama = String(values.nama || "").trim().slice(0, 150) || `Baris ${r}`;
          if (!kode) kode = `IMP-${String(Date.now()).slice(-6)}-${String(++seq).padStart(3, "0")}`;
          const kategoriName = String(values.kategori_id || values.kategori || "").trim().toLowerCase();
          const kategoriIdRow = targetKat ? targetKat.id : katByName.get(kategoriName);
          const jumlah = clampInt(toNum(values.jumlah));
          const harga = Math.min(toNum(values.harga), 9999999999999.99);
          let tanggal = String(values.tanggal || "").trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) tanggal = today;
          let status = String(values.status || "").trim();
          if (!["Masuk", "Keluar", "Pending"].includes(status)) status = "Pending";
          const keterangan = String(values.keterangan || "").trim() || null;
          const fmJson = Object.keys(fm).length ? fm : null;
          const nilaiJson = Object.keys(nilai).length ? nilai : null;

          try {
            await pool.query(
              `INSERT INTO data_barang (kode, nama, kategori_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                kode,
                nama,
                kategoriIdRow ?? null,
                jumlah,
                harga,
                tanggal,
                status,
                keterangan,
                fmJson ? JSON.stringify(fmJson) : null,
                nilaiJson ? JSON.stringify(nilaiJson) : null,
              ]
            );
            results.inserted++;
            gridRow++;
            affectedKodes.push(kode);
          } catch (err) {
            if (err.code === "ER_DUP_ENTRY") {
              try {
                await pool.query(
                  `UPDATE data_barang SET nama=?, kategori_id=?, jumlah=?, harga=?, tanggal=?, status=?, keterangan=?, formulas=?, nilai=? WHERE kode=?`,
                  [
                    nama,
                    kategoriIdRow ?? null,
                    jumlah,
                    harga,
                    tanggal,
                    status,
                    keterangan,
                    fmJson ? JSON.stringify(fmJson) : null,
                    nilaiJson ? JSON.stringify(nilaiJson) : null,
                    kode,
                  ]
                );
                 results.updated = (results.updated || 0) + 1;
                 affectedKodes.push(kode);
               } catch (e2) {
                 results.skipped++;
                 results.errors.push(`Baris ${r}: Kode "${kode}" sudah ada`);
               }
             } else {
               results.skipped++;
               results.errors.push(`Baris ${r}: ${err.message}`);
             }
           }
         }

         if (targetKat) {
           await pool.query("UPDATE kategori SET kolom = ? WHERE id = ?", [JSON.stringify(kolomConfig), targetKat.id]);
          results.columnsChanged = true;
          results.targetKatId = targetKat.id;
        } else {
          const [rows] = await pool.query("SELECT id FROM kategori ORDER BY id LIMIT 1");
          if (rows.length) {
            await pool.query("UPDATE kategori SET kolom = ? WHERE id = ?", [JSON.stringify(kolomConfig), rows[0].id]);
            results.columnsChanged = true;
            results.targetKatId = rows[0].id;
          }
        }
        results.kolomConfig = kolomConfig;

        {
          const sheetReg = await registerSheetForImport(pool, req, {
            nama: (req.body && req.body.filename) || ws.name,
            kolom: kolomConfig,
            kodes: affectedKodes,
            sumberFile: (req.body && req.body.filename) || null,
          });
          if (sheetReg) {
            results.sheetId = sheetReg.id;
            results.sheetName = sheetReg.nama;
          }
        }

        console.log(`[IMPORT] selesai ${JSON.stringify(results)}`);
        logAudit({
          userId: req.user.id,
          action: "import",
          module: "import",
          description: `Import Excel "${(req.body && req.body.filename) || "tanpa nama"}" → ${results.inserted} data (${results.updated || 0} update, ${results.skipped} skipped)`,
          recordId: results.targetKatId || null,
          newData: { filename: (req.body && req.body.filename) || null, kategoriId: kategoriId || null, ...results },
          req,
        });
        return res.json({ message: "Import selesai", ...results });
      }

      const plan = [];
      if (Array.isArray(columns) && columns.length) {
        for (const c of columns) {
          plan.push({
            key: c.key === "kategori_id" ? "kategori" : c.key,
            standard: STANDARD_KEYS_SERVER.includes(c.key) || c.key === "kategori_id",
            customKey: c.key,
          });
        }
      } else {
        for (const k of ["kode", "nama", "kategori", "jumlah", "harga", "tanggal", "status", "keterangan"]) {
          plan.push({ key: k, standard: true, customKey: k });
        }
      }

      let maxCol = 0;
      for (let r = 1; r <= ws.rowCount; r++) {
        ws.getRow(r).eachCell({ includeEmpty: false }, (cell, colNum) => {
          if (colNum > maxCol) maxCol = colNum;
        });
      }
      const baseCount = plan.length;
      for (let c = baseCount; c < maxCol; c++) {
        plan.push({ key: `kimport${c + 1}`, standard: false, customKey: `kimport${c + 1}`, label: `Kolom ${c + 1}`, added: true });
      }
      const addedColumns = plan
        .filter((p) => p.added)
        .map((p) => ({ key: p.customKey, label: p.label, type: "text", width: 140, visible: true }));

      console.log(
        `[IMPORT] mulai file=${(req.body && req.body.filename) || "?"} MODE=RAW kategoriId=${kategoriId || "-"} plan=${JSON.stringify(plan.map((p) => p.key))} maxCol=${maxCol}`
      );

      const results = { inserted: 0, skipped: 0, errors: [], totalRows: 0 };
      const affectedKodes = [];
      let seq = 0;
      for (let r = 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const cells = [];
        let any = false;
        for (let c = 1; c <= maxCol; c++) {
          const v = row.getCell(c).value;
          let s = "";
          if (v !== null && v !== undefined) {
            const val = typeof v === "object" && v !== null && "result" in v ? v.result : v;
            s = val instanceof Date ? fmtDate(val) : String(val).trim();
          }
          cells.push(s);
          if (s !== "") any = true;
        }
        if (!any) continue;
        results.totalRows++;

        const values = {};
        const nilai = {};
        for (let c = 0; c < cells.length; c++) {
          const s = cells[c];
          if (s === "") continue;
          const entry = plan[c];
          if (!entry) continue;
          if (entry.standard) values[entry.key] = s;
          else nilai[entry.customKey] = s;
        }

        let kode = String(values.kode || "").trim().slice(0, 50);
        const nama = String(values.nama || "").trim().slice(0, 150) || `Baris ${r}`;
        if (!kode) kode = `IMP-${String(Date.now()).slice(-6)}-${String(++seq).padStart(3, "0")}`;
        const kategoriName = String(values.kategori || "").trim().toLowerCase();
        const kategoriIdRow = targetKat ? targetKat.id : katByName.get(kategoriName);
        const jumlah = clampInt(toNum(values.jumlah));
        const harga = Math.min(toNum(values.harga), 9999999999999.99);
        let tanggal = String(values.tanggal || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) tanggal = today;
        let status = String(values.status || "").trim();
        if (!["Masuk", "Keluar", "Pending"].includes(status)) status = "Pending";
        const keterangan = String(values.keterangan || "").trim() || null;

        try {
          await pool.query(
            `INSERT INTO data_barang (kode, nama, kategori_id, jumlah, harga, tanggal, status, keterangan, nilai)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              kode,
              nama,
              kategoriIdRow ?? null,
              jumlah,
              harga,
              tanggal,
              status,
              keterangan,
              Object.keys(nilai).length ? JSON.stringify(nilai) : null,
            ]
          );
          results.inserted++;
          affectedKodes.push(kode);
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY") {
            try {
              await pool.query(
                `UPDATE data_barang SET nama=?, kategori_id=?, jumlah=?, harga=?, tanggal=?, status=?, keterangan=?, nilai=? WHERE kode=?`,
                [
                  nama,
                  kategoriIdRow ?? null,
                  jumlah,
                  harga,
                  tanggal,
                  status,
                  keterangan,
                  Object.keys(nilai).length ? JSON.stringify(nilai) : null,
                  kode,
                ]
              );
              results.updated = (results.updated || 0) + 1;
              affectedKodes.push(kode);
            } catch (e2) {
              results.skipped++;
              results.errors.push(`Baris ${r}: Kode "${kode}" sudah ada`);
            }
          } else {
            results.skipped++;
            results.errors.push(`Baris ${r}: ${err.message}`);
          }
        }
      }

      if (addedColumns.length && targetKat) {
        let kolom = [];
        if (Array.isArray(targetKat.kolom)) kolom = targetKat.kolom.slice();
        else if (Array.isArray(columns) && columns.length) kolom = columns.map((c) => ({ key: c.key, label: c.label, type: c.type, width: c.width, visible: c.visible !== false }));
        else
          kolom = ["kode", "nama", "kategori_id", "jumlah", "harga", "total", "tanggal", "status", "keterangan"].map((k) => ({
            key: k,
            label: k,
            type: "text",
            width: 140,
            visible: true,
          }));
        for (const ac of addedColumns) if (!kolom.some((k) => k.key === ac.key)) kolom.push(ac);
        await pool.query("UPDATE kategori SET kolom = ? WHERE id = ?", [JSON.stringify(kolom), targetKat.id]);
        results.columnsChanged = true;
        results.targetKatId = targetKat.id;
        results.kolomConfig = kolom;
      } else if (!targetKat) {
        const kolom = ["kode", "nama", "kategori_id", "jumlah", "harga", "total", "tanggal", "status", "keterangan"].map((k) => ({
          key: k, label: k, type: "text", width: 140, visible: true,
        }));
        for (const ac of addedColumns) if (!kolom.some((k) => k.key === ac.key)) kolom.push(ac);
        const [rows] = await pool.query("SELECT id FROM kategori ORDER BY id LIMIT 1");
        if (rows.length) {
          await pool.query("UPDATE kategori SET kolom = ? WHERE id = ?", [JSON.stringify(kolom), rows[0].id]);
          results.columnsChanged = true;
          results.targetKatId = rows[0].id;
        }
        results.kolomConfig = kolom;
      }

      {
        const sheetReg = await registerSheetForImport(pool, req, {
          nama: (req.body && req.body.filename) || ws.name,
          kolom: results.kolomConfig,
          kodes: affectedKodes,
          sumberFile: (req.body && req.body.filename) || null,
        });
        if (sheetReg) {
          results.sheetId = sheetReg.id;
          results.sheetName = sheetReg.nama;
        }
      }

      console.log(`[IMPORT] selesai ${JSON.stringify(results)}`);
      logAudit({
        userId: req.user.id,
        action: "import",
        module: "import",
        description: `Import Excel "${(req.body && req.body.filename) || "tanpa nama"}" → ${results.inserted} data (${results.updated || 0} update, ${results.skipped} skipped)`,
        recordId: results.targetKatId || null,
        newData: { filename: (req.body && req.body.filename) || null, kategoriId: kategoriId || null, ...results },
        req,
      });
      return res.json({ message: "Import selesai", ...results });
    }

    // Baris tanpa Kode/Nama tidak lagi dibuang: kode & nama dibuat otomatis
    // agar hasil import selalu tampak mengikuti isi file.

    const cellText = (row, name) => {
      const ci = colMap[name];
      if (!ci) return "";
      const v = row.getCell(ci).value;
      if (v === null || v === undefined) return "";
      const val = typeof v === "object" && v !== null && "result" in v ? v.result : v;
      if (val instanceof Date) return val;
      return String(val).trim();
    };

    const results = { inserted: 0, skipped: 0, errors: [], totalRows: 0 };
    const affectedKodes = [];
    let seq = 0;
    let insCount = 0;
    console.log(
      `[IMPORT] mulai file=${(req.body && req.body.filename) || "?"} kategoriId=${kategoriId || "-"} headerRow=${headerRowNum} colMap=${JSON.stringify(colMap)} customCols=${JSON.stringify(customCols)}`
    );
    for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      let hasData = false;
      for (const ci of [...Object.values(colMap), ...Object.values(customCols)]) {
        const cv = cellRaw(row.getCell(ci));
        if (cv.value !== "" || cv.formula) {
          hasData = true;
          break;
        }
      }
      if (!hasData) continue;
      results.totalRows++;

      let kode = String(cellText(row, "kode")).trim();
      let nama = String(cellText(row, "nama")).trim();
      if (!kode) {
        kode = `IMP-${String(Date.now()).slice(-6)}-${String(++seq).padStart(3, "0")}`;
      }
      if (!nama) {
        nama = `Baris ${r}`;
      }

      const kategoriName = String(cellText(row, "kategori")).trim().toLowerCase();
      const kategoriIdRow = targetKat ? targetKat.id : katByName.get(kategoriName);
      const jumlah = clampInt(toNum(cellText(row, "jumlah")));
      const harga = toNum(cellText(row, "harga"));
      let tanggal = cellText(row, "tanggal");
      if (tanggal instanceof Date) tanggal = fmtDate(tanggal);
      else {
        const t = String(tanggal).slice(0, 10);
        tanggal = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : today;
      }
      let status = String(cellText(row, "status")).trim() || "Pending";
      if (!["Masuk", "Keluar", "Pending"].includes(status)) status = "Pending";
      const keterangan = String(cellText(row, "keterangan")).trim() || null;

      const nilai = {};
      for (const [customKey, ci] of Object.entries(customCols)) {
        const v = row.getCell(ci).value;
        if (v === null || v === undefined) continue;
        const val = typeof v === "object" && v !== null && "result" in v ? v.result : v;
        if (val instanceof Date) continue;
        const s = String(val).trim();
        if (s !== "") nilai[customKey] = s;
      }

      // Pertahankan rumus Excel sebagai rumus (bukan hanya hasil angkanya).
      const fm = {};
      const gridNum = baseRows + insCount;
      for (const [nm, ci] of Object.entries(colMap)) {
        const { formula } = cellRaw(row.getCell(ci));
        if (formula && !/[![\]]/.test(formula)) fm[nm] = translateFormula(formula, r - gridNum);
      }
      for (const [ck, ci] of Object.entries(customCols)) {
        const { formula } = cellRaw(row.getCell(ci));
        if (formula && !/[![\]]/.test(formula)) fm[ck] = translateFormula(formula, r - gridNum);
      }
      const fmJson = Object.keys(fm).length ? JSON.stringify(fm) : null;

      try {
        await pool.query(
          `INSERT INTO data_barang (kode, nama, kategori_id, jumlah, harga, tanggal, status, keterangan, formulas, nilai)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            kode,
            nama,
            kategoriIdRow ?? null,
            jumlah,
            harga,
            tanggal,
            status,
            keterangan,
            fmJson,
            Object.keys(nilai).length ? JSON.stringify(nilai) : null,
          ]
        );
        results.inserted++;
        insCount++;
        affectedKodes.push(kode);
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          try {
            await pool.query(
              `UPDATE data_barang SET nama=?, kategori_id=?, jumlah=?, harga=?, tanggal=?, status=?, keterangan=?, formulas=?, nilai=? WHERE kode=?`,
              [
                nama,
                kategoriIdRow ?? null,
                jumlah,
                harga,
                tanggal,
                status,
                keterangan,
                fmJson,
                Object.keys(nilai).length ? JSON.stringify(nilai) : null,
                kode,
              ]
            );
            results.updated = (results.updated || 0) + 1;
            affectedKodes.push(kode);
          } catch (e2) {
            results.skipped++;
            results.errors.push(`Baris ${r}: Kode "${kode}" sudah ada`);
          }
        } else {
          results.skipped++;
          results.errors.push(`Baris ${r}: ${err.message}`);
        }
      }
    }

    console.log(`[IMPORT] selesai ${JSON.stringify(results)}`);

    // Simpan konfigurasi kolom urut sesuai file supaya huruf rumus
    // (A, B, C, ...) di grid sama persis dengan posisi kolom Excel.
    {
      let existing = [];
      if (targetKat && Array.isArray(targetKat.kolom)) existing = targetKat.kolom.filter(Boolean);
      let kolom =
        Array.isArray(orderedCfg) && orderedCfg.length
          ? orderedCfg.slice()
          : existing.length
            ? existing
            : ["kode", "nama", "kategori_id", "jumlah", "harga", "total", "tanggal", "status", "keterangan"].map((k) => ({
                key: k,
                label: STD_CFG[k]?.label || k,
                type: STD_CFG[k]?.type || "text",
                width: STD_CFG[k]?.width || 140,
                ...(STD_CFG[k]?.format ? { format: STD_CFG[k].format } : {}),
                visible: true,
              }));
      for (const ex of existing) {
        if (ex && ex.key && !kolom.some((x) => x.key === ex.key)) kolom.push(ex);
      }
      results.kolomConfig = kolom;
      const katIdToUpdate = targetKat ? targetKat.id : null;
      let katIdFinal = katIdToUpdate;
      if (!katIdFinal) {
        const [rows] = await pool.query("SELECT id FROM kategori ORDER BY id LIMIT 1");
        if (rows.length) katIdFinal = rows[0].id;
      }
      if (katIdFinal) {
        await pool.query("UPDATE kategori SET kolom = ? WHERE id = ?", [JSON.stringify(kolom), katIdFinal]);
        results.columnsChanged = true;
        results.targetKatId = katIdFinal;
      }
    }

    {
      const sheetReg = await registerSheetForImport(pool, req, {
        nama: (req.body && req.body.filename) || ws.name,
        kolom: results.kolomConfig,
        kodes: affectedKodes,
        sumberFile: (req.body && req.body.filename) || null,
      });
      if (sheetReg) {
        results.sheetId = sheetReg.id;
        results.sheetName = sheetReg.nama;
      }
    }

    console.log(`[IMPORT] selesai ${JSON.stringify(results)}`);
    logAudit({
      userId: req.user.id,
      action: "import",
      module: "import",
      description: `Import Excel "${(req.body && req.body.filename) || "tanpa nama"}" → ${results.inserted} data (${results.updated || 0} update, ${results.skipped} skipped)`,
      recordId: results.targetKatId || null,
      newData: { filename: (req.body && req.body.filename) || null, kategoriId: kategoriId || null, ...results },
      req,
    });
    res.json({ message: "Import selesai", ...results });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// Klasifikasi Manual (Belum Diklasifikasikan -> Spreadsheet)
// Data hasil import tidak diklasifikasikan otomatis. User memilih data
// secara manual lalu memindahkannya ke Spreadsheet (tab pada halaman
// Spreadsheet). Data dengan sheet_id = NULL berarti "Belum Diklasifikasikan".
// Tidak ada heuristik otomatis berdasarkan nama, kategori, nilai, keyword,
// maupun isi Excel.
// =====================================================================

const SELECT_DATA_COLS = `
  d.id, d.kode, d.nama, d.jumlah, d.harga, d.tanggal, d.status,
  d.keterangan, d.formulas, d.nilai, d.kategori_id, d.sub_kategori_id, d.sheet_id,
  k.nama_kategori, sk.nama AS nama_sub_kategori, sp.nama AS nama_sheet`;

// ---- CRUD Spreadsheet (tab pada halaman Spreadsheet) ----

app.get("/api/spreadsheet", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT sp.*,
              (SELECT COUNT(*) FROM data_barang d WHERE d.sheet_id = sp.id) AS jumlah_data
       FROM spreadsheet sp ORDER BY sp.id ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---- Aturan LOCK/UNLOCK milik Admin untuk satu sheet ----
//
// Dipakai halaman Spreadsheet untuk menandai sel yang terkunci. Mengembalikan
// ATURAN (bukan data), lalu client menyelesaikan per-sel memakai aturan paling
// spesifik: workbook < sheet < kolom/baris < range < cell.
app.get("/api/locks", async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") return res.json({ rules: [] });
    const workbookKey = String(req.query.workbookKey || "").trim();
    const sheetName = String(req.query.sheetName || "").trim();
    const sheetId = req.query.sheetId ? Number(req.query.sheetId) : null;
    const rules = await loadScopeRules(req.user.id);
    if (!rules.length) return res.json({ rules: [] });

    let wb = workbookKey;
    let sid = sheetId;
    // Cocokkan baris spreadsheet ASLI untuk worksheet ini. Nama file di browser
    // boleh Bringing ekstensi (.xlsx) - dinormalisasi lewat workbookAliases.
    const cands = workbookAliases(workbookKey);
    if (cands.length) {
      const [rows] = await pool.query(
        `SELECT * FROM spreadsheet
          WHERE LOWER(COALESCE(sumber_file, '')) IN (?)
             OR LOWER(nama) IN (?)
             OR LOWER(nama) LIKE CONCAT(?, '%@')
          ORDER BY id ASC`,
        [cands, cands, cands[0]]
      );
      const label = (r) => {
        const n = String(r.nama || "");
        return (n.includes("@") ? n.slice(n.lastIndexOf("@") + 1) : n).trim().toLowerCase();
      };
      const want = sheetName.toLowerCase();
      const hit = want
        ? rows.find((r) => label(r) === want) || rows.find((r) => label(r).includes(want))
        : rows[0];
      if (hit) { sid = hit.id; wb = hit.sumber_file || hit.nama; }
    }
    if (!wb) wb = workbookKey;

    const rel = rulesForSheet(rules, { workbookKey: wb, sheetId: sid });
    res.json({
      sheetId: sid,
      workbookKey: wb,
      rules: rel.map((r) => ({
        id: r.id, level: r.level, status: r.status,
        r1: r.r1, c1: r.c1, r2: r.r2, c2: r.c2,
        colKeys: r.colKeys, canEntry: r.canEntry, canEdit: r.canEdit,
      })),
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/spreadsheet", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { nama, kolom } = req.body || {};
    if (!nama || !nama.trim()) {
      return res.status(400).json({ error: "Nama spreadsheets wajib diisi" });
    }
    const kolomJson = Array.isArray(kolom) ? JSON.stringify(kolom) : null;
    const [result] = await pool.query(
      "INSERT INTO spreadsheet (nama, kolom) VALUES (?, ?)",
      [nama.trim(), kolomJson]
    );
    logAudit({
      userId: req.user.id,
      action: "create",
      module: "spreadsheet",
      description: `Menambah spreadsheet "${nama.trim()}"`,
      recordId: result.insertId,
      newData: { nama: nama.trim(), kolom: Array.isArray(kolom) ? kolom : null },
      req,
    });
    res.status(201).json({ id: result.insertId, message: "Spreadsheet berhasil ditambahkan" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Nama spreadsheets sudah ada" });
    }
    next(err);
  }
});

app.put("/api/spreadsheet/:id", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { nama, kolom } = req.body || {};
    const [[old]] = await pool.query("SELECT id, nama, kolom FROM spreadsheet WHERE id = ?", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Spreadsheet tidak ditemukan" });
    const sets = [];
    const params = [];
    if (nama !== undefined) { sets.push("nama = ?"); params.push(nama.trim()); }
    if (kolom !== undefined) { sets.push("kolom = ?"); params.push(Array.isArray(kolom) ? JSON.stringify(kolom) : null); }
    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada yang diubah" });
    params.push(req.params.id);
    const [result] = await pool.query(
      `UPDATE spreadsheet SET ${sets.join(", ")} WHERE id = ?`, params
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Spreadsheet tidak ditemukan" });
    }
    logAudit({
      userId: req.user.id,
      action: "update",
      module: "spreadsheet",
      description: `Mengubah spreadsheet "${old.nama}"`,
      recordId: req.params.id,
      oldData: { nama: old.nama, kolom: old.kolom || null },
      newData: {
        nama: nama !== undefined ? nama.trim() : old.nama,
        kolom: kolom !== undefined ? (Array.isArray(kolom) ? kolom : null) : (old.kolom || null),
      },
      req,
    });
    res.json({ message: "Spreadsheet berhasil diubah" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Nama spreadsheets sudah ada" });
    }
    next(err);
  }
});

app.delete("/api/spreadsheet/:id", requireRole("super_admin"), async (req, res, next) => {
  try {
    const [[old]] = await pool.query("SELECT id, nama FROM spreadsheet WHERE id = ?", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Spreadsheet tidak ditemukan" });
    await deleteSpreadsheetRows([req.params.id]);
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "spreadsheet",
      description: `Menghapus spreadsheet "${old.nama}"`,
      recordId: req.params.id,
      oldData: { nama: old.nama },
      req,
    });
    res.json({ message: "Spreadsheet berhasil dihapus. Datanya kembali ke Belum Diklasifikasikan." });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/spreadsheet", requireRole("super_admin"), async (req, res, next) => {
  try {
    const [sheets] = await pool.query("SELECT id, nama FROM spreadsheet");
    if (!sheets.length) {
      return res.json({ message: "Tidak ada spreadsheet untuk dihapus", deleted: 0 });
    }
    const ids = sheets.map((s) => s.id);
    await deleteSpreadsheetRows(ids);
    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "spreadsheet",
      description: `Menghapus semua spreadsheet (${sheets.length})`,
      oldData: { nama: sheets.map((s) => s.nama) },
      req,
    });
    res.json({ message: `Semua spreadsheet dihapus (${sheets.length}). Datanya kembali ke Belum Diklasifikasikan.`, deleted: sheets.length });
  } catch (err) {
    next(err);
  }
});

// Hapus spreadsheet beserta sub-tabel/bagian yang menunjuknya. Penugasan admin
// yang menunjuk ke bagian tersebut dikembalikan ke "seluruh sheet", dan datanya
// dikembalikan ke "Belum Diklasifikasikan" (bukan dihapus).
async function deleteSpreadsheetRows(ids) {
  const ph = ids.map(() => "?").join(",");
  const [secs] = await pool.query(`SELECT id FROM spreadsheet_sections WHERE sheet_id IN (${ph})`, ids);
  const secIds = secs.map((s) => s.id);
  if (secIds.length) {
    const secPh = secIds.map(() => "?").join(",");
    await pool.query(`UPDATE admin_table_permissions SET section_id = NULL WHERE section_id IN (${secPh})`, secIds);
    await pool.query(`DELETE FROM spreadsheet_sections WHERE id IN (${secPh})`, secIds);
  }
  await pool.query(`UPDATE data_barang SET sheet_id = NULL WHERE sheet_id IN (${ph})`, ids);
  await pool.query(`DELETE FROM spreadsheet WHERE id IN (${ph})`, ids);
}

// ---- Data di dalam sebuah Spreadsheet ----

app.get("/api/spreadsheet/:id/data", async (req, res, next) => {
  try {
    const [[sheet]] = await pool.query("SELECT * FROM spreadsheet WHERE id = ?", [req.params.id]);
    if (!sheet) return res.status(404).json({ error: "Spreadsheet tidak ditemukan" });
    const [rows] = await pool.query(
      `SELECT ${SELECT_DATA_COLS}
       FROM data_barang d
       LEFT JOIN kategori k ON k.id = d.kategori_id
       LEFT JOIN sub_kategori sk ON sk.id = d.sub_kategori_id
       LEFT JOIN spreadsheet sp ON sp.id = d.sheet_id
       WHERE d.sheet_id = ?
       ORDER BY d.id ASC`,
      [req.params.id]
    );
    res.json({ spreadsheet: sheet, data: rows });
  } catch (err) {
    next(err);
  }
});

// ---- Data untuk klasifikasi manual ----

// Daftar data yang belum diklasifikasikan (sheet_id = NULL).
app.get("/api/klasifikasi", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const params = [];
    let whereSql = "d.sheet_id IS NULL";
    if (q) {
      whereSql += " AND (d.kode LIKE ? OR d.nama LIKE ? OR d.keterangan LIKE ?)";
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM data_barang d WHERE ${whereSql}`, params
    );
    const [rows] = await pool.query(
      `SELECT ${SELECT_DATA_COLS}
       FROM data_barang d
       LEFT JOIN kategori k ON k.id = d.kategori_id
       LEFT JOIN sub_kategori sk ON sk.id = d.sub_kategori_id
       LEFT JOIN spreadsheet sp ON sp.id = d.sheet_id
       WHERE ${whereSql}
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT 10000`,
      params
    );
    res.json({ data: rows, total });
  } catch (err) {
    next(err);
  }
});

// Pindahkan data yang dipilih secara MANUAL ke Spreadsheet tujuan.
// Body: { ids: [..], sheetId: <int> }  =>  sheetId = null untuk kembali "Belum Diklasifikasikan".
app.post("/api/klasifikasi/klasifikasikan", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { ids, sheetId } = req.body || {};
    const idList = Array.isArray(ids) ? ids.filter((x) => x != null) : [];
    if (idList.length === 0) {
      return res.status(400).json({ error: "Tidak ada data yang dipilih" });
    }
    if (sheetId === null || sheetId === undefined || sheetId === "") {
      return res.status(400).json({ error: "Pilih Spreadsheet tujuan" });
    }
    const [[sheet]] = await pool.query("SELECT id, nama FROM spreadsheet WHERE id = ?", [sheetId]);
    if (!sheet) {
      return res.status(404).json({ error: "Spreadsheet tujuan tidak ditemukan" });
    }

    const [result] = await pool.query(
      "UPDATE data_barang SET sheet_id = ? WHERE id IN (?)",
      [sheetId, idList]
    );

    logAudit({
      userId: req.user.id,
      action: "klasifikasi",
      module: "spreadsheet",
      description: `Memindahkan ${result.affectedRows} data ke spreadsheet "${sheet.nama}"`,
      recordId: sheet.id,
      newData: { sheetId: sheet.id, sheetName: sheet.nama, moved: result.affectedRows, ids: idList.slice(0, 500) },
      req,
    });

      res.json({
      message: `${result.affectedRows} data berhasil dipindahkan ke spreadsheet "${sheet.nama}"`,
      moved: result.affectedRows,
      sheetId: Number(sheetId),
    });
  } catch (err) {
    next(err);
  }
});


app.get("*", (req, res) => {
  // Aset (js/css/img/dll) yang tidak ada harus 404, bukan index.html.
  // Jika tidak, browser menerima HTML untuk <script/src=...> dan halaman gagal render.
  const ext = path.extname(decodeURIComponent(req.path)).toLowerCase();
  if (ext) {
    return res.status(404).json({ error: "File tidak ditemukan", path: req.path });
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan pada server", detail: err.message });
});

// Pemeriksa izin baris untuk jalur kolaborasi: memakai aturan granular
// sheet yang sama dengan PUT /api/data/:id (kunci scope + kolom/baris).
setRowWriteChecker(async (user, row, changed) => {
  const req = { user };
  if (await scopeBlocksSheet(req, row.sheet_id)) {
    return { ok: false, reason: "Sheet ini terkunci untuk akun Anda oleh Super Admin" };
  }
  const can = await adminCanWriteSpreadsheetRow(req, row.sheet_id, row.id, changed || [], "edit");
  return can
    ? { ok: true }
    : { ok: false, reason: "Anda tidak memiliki izin edit pada bagian/kolom baris ini" };
});

const http = require("http");
const { attachRealtime } = require("./realtime");

initDatabase()
  .then(() => {
    const httpServer = http.createServer(app);
    attachRealtime(httpServer);
    httpServer.listen(PORT, () => {
      console.log(`Server API berjalan di http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    const detail = (err && err.message) || (err && err.code) || String(err);
    console.error("Gagal inisialisasi database:", detail);
    if (err && (err.code === "ECONNREFUSED" || /ECONNREFUSED/.test(String(detail)))) {
      console.error(
        `Pastikan MySQL/MariaDB berjalan di ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306} ` +
          `(Laragon: klik Start / Start MySQL), lalu jalankan ulang "npm run dev".`
      );
    }
    process.exit(1);
  });
