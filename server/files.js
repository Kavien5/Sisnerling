/**
 * Penyimpanan permanen file Excel hasil import.
 *
 * TUJUAN
 * File yang sudah berhasil di-import harus TETAP ADA setelah refresh, pindah
 * halaman, logout/login, dan restart backend. Karena itu:
 *   1. Byte asli file .xlsx ditulis ke DISK (server/storage/workbooks), bukan
 *      hanya disimpan di memory / React state / browser.
 *   2. Metadata file + daftar sheet disimpan di MySQL (workbook_files,
 *      workbook_sheets) dengan ID permanen WB_xxx / SHEET_xxx.
 *   3. File asli disimpan APA ADanya (tidak ditulis ulang dari grid), sehingga
 *      sheet, formula, merge, format, gambar, dan baris/kolom kosong tetap
 *      utuh seperti aslinya.
 *
 * Prinsip: tidak ada file yang dihapus otomatis. Penghapusan hanya terjadi bila
 * Super Admin memanggil endpoint hapus secara eksplisit.
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const ExcelJS = require("exceljs");
const { pool } = require("./db");
const { authRequired, requireRole } = require("./auth");
const { logAudit } = require("./auditLog");

// Folder penyimpanan file asli. Berada di luar folder yang di-build Vite.
const STORAGE_ROOT = path.join(__dirname, "storage", "workbooks");
// Batas ukuran file yang diterima (10 MB), sama dengan batas lama di UI.
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = [".xlsx", ".xlsm", ".xls"];
// Nama workbook dinormalisasi tanpa ekstensi. Sengaja TIDAK memakai /\.[^.]+$/
// supaya nama seperti "1. LK Neraca ..." tidak terpotong jadi "1".
const WORKBOOK_EXT = /\.(xlsx|xlsm|xlsb|xls|ods|odsf|csv)$/i;

/** Kunci pembanding nama file: tanpa path, tanpa ekstensi, huruf kecil, spasi rapat. */
function normWorkbookName(v) {
  const base = String(v == null ? "" : v).trim().split(/[\\/]/).pop().trim();
  return base.replace(WORKBOOK_EXT, "").replace(/\s+/g, " ").toLowerCase();
}

function ensureStorageRoot() {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  }
}

// ---------- Generate ID permanen (WB_001 / SHEET_001) ----------

/**
 * Nomor urut berikutnya untuk prefix tertentu.
 *
 * Dihitung dari nomor terbesar yang ada, bukan dari baris terakhir: kode bisa
 * diimpor dengan nomor eksplisit atau dihapus di tengah jalan, dan dua hal itu
 * tidak boleh menyebabkan kode bentrok dengan file/sheet yang sudah ada.
 */
async function nextCode(pool_, table, codeCol, prefix) {
  // Pakai REGEXP, bukan LIKE: prefix mengandung "_" yang pada LIKE berarti
  // wildcard (huruf apa saja), sehingga bisa ikut mencocokkan kode lain.
  const [rows] = await pool_.query(
    `SELECT ${codeCol} AS c FROM ${table} WHERE ${codeCol} REGEXP ?`,
    [`^${prefix}[0-9]+$`]
  );
  let max = 0;
  for (const r of rows || []) {
    const digits = String(r.c || "").replace(/\D/g, "");
    if (!digits) continue;
    const n = Number(digits);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/**
 * Kode sheet berikutnya yang belum dipakai di SELURUH workbook.
 * Sheet ID bersifat global & unik supaya referensi antar-file tidak ambigu.
 */
async function nextSheetCode() {
  return nextCode(pool, "workbook_sheets", "sheet_code", "SHEET_");
}

// ---------- Penyimpanan byte file ----------

/**
 * Tulis byte workbook ke disk. Nama file di disk memakai kode workbook yang
 * stabil + hash isi, jadi tidak pernah menimpa file lain dan file yang sama
 * tidak perlu ditulis ulang.
 *
 * `kind` menentukan perannya:
 *   - "original" : byte apa adanya hasil import. TIDAK PERNAH ditimpa.
 *   - "current"  : byte yang disajikan ke klien (hasil import atau edit terakhir).
 */
async function writeOriginalFile(workbookCode, buffer, kind = "current") {
  ensureStorageRoot();
  const dir = path.join(STORAGE_ROOT, workbookCode);
  await fsp.mkdir(dir, { recursive: true });
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  // Hash pada nama file: file dengan isi sama tidak perlu ditulis ulang, dan
  // file berbeda tidak mungkin saling menimpa.
  const fileName = `${kind}-${sha256.slice(0, 12)}.xlsx`;
  const abs = path.join(dir, fileName);
  try {
    await fsp.writeFile(abs, buffer, { flag: "wx" });
  } catch (err) {
    // EEXIST = isi identik sudah tersimpan, bukan kegagalan.
    if (err.code !== "EEXIST") throw err;
  }
  return { storedPath: path.join(workbookCode, fileName), sizeBytes: buffer.length, sha256 };
}

/**
 * Hapus blob di disk yang sudah tidak dirujuk workbook mana pun.
 *
 * Yang DIPERTAHANKAN: byte asli (original) dan byte current. Hanya versi
 * antara yang sudah tergantikan isinya yang dibersihkan supaya folder storage
 * tidak tumbuh tanpa batas setiap kali editor menyimpan perubahan.
 */
async function pruneWorkbookDir(workbookCode, keepPaths = []) {
  const dir = path.join(STORAGE_ROOT, workbookCode);
  if (!fs.existsSync(dir)) return;
  const keep = new Set(keepPaths.filter(Boolean).map((p) => path.basename(p)));
  let entries = [];
  try {
    entries = await fsp.readdir(dir);
  } catch (_) {
    return;
  }
  for (const name of entries) {
    if (keep.has(name)) continue;
    try {
      await fsp.rm(path.join(dir, name), { force: true });
    } catch (_) {
      /* file mungkin sedang dipakai; coba lagi lain kali */
    }
  }
}

/**
 * Baca byte file asli dari disk. Mengembalikan null bila file di disk tidak ada
 * (mis. workbook yang hanya berasal dari backfill sheet lama tanpa byte).
 */
async function readOriginalFile(storedPath) {
  if (!storedPath) return null;
  // Cegah path traversal: pastikan hasil resolve tetap di dalam STORAGE_ROOT.
  const abs = path.resolve(STORAGE_ROOT, storedPath);
  if (!abs.startsWith(path.resolve(STORAGE_ROOT))) return null;
  try {
    const st = await fsp.stat(abs);
    if (!st.isFile()) return null;
    return await fsp.readFile(abs);
  } catch {
    return null;
  }
}

/**
 * Ekstrak struktur workbook dari file .xlsx. Dipakai untuk mengisi metadata
 * sheet (nama, urutan, merge, jumlah baris/kolom) TANPA mengubah isi file.
 *
 * Catatan penting: baris/kolom yang kosong TIDAK dipangkas. Nilai bawaan ExcelJS
 * sudah mencerminkan batas data yang tersimpan di file, termasuk baris kosong
 * yang menyisipkan struktur. Kita hanya membacanya apa adanya.
 */
async function extractWorkbookStructure(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return (wb.worksheets || []).map((ws, index) => {
    const merges = [];
    // ExcelJS menyimpan daftar merge di worksheet; ambil defensif agar
    // perubahan versi ExcelJS tidak membuat import gagal.
    try {
      const internal = ws._merges || {};
      for (const range of Object.keys(internal)) {
        const m = internal[range];
        if (!m) continue;
        merges.push({
          top: m.top,
          left: m.left,
          bottom: m.bottom,
          right: m.right,
          range,
        });
      }
    } catch (_) {
      /* abaikan: merge hanya metadata tambahan */
    }

    // Ukuran kolom & baris (dimuka juga oleh ExcelJS pada hampir semua file).
    const columnWidths = {};
    try {
      for (let c = 1; c <= (ws.columnCount || 0); c++) {
        const col = ws.getColumn(c);
        if (col && col.width != null) columnWidths[c] = col.width;
      }
    } catch (_) {
      /* abaikan */
    }
    const rowHeights = {};
    try {
      for (let r = 1; r <= (ws.rowCount || 0); r++) {
        const row = ws.getRow(r);
        if (row && row.height != null) rowHeights[r] = row.height;
      }
    } catch (_) {
      /* abaikan */
    }

    const hidden = ws.state === "hidden" || ws.state === "veryHidden" ? 1 : 0;

    return {
      namaSheet: String(ws.name || `Sheet${index + 1}`),
      sheetIndex: index,
      hidden,
      rowCount: ws.rowCount || 0,
      colCount: ws.columnCount || 0,
      merges,
      struktur: {
        merges,
        columnWidths,
        rowHeights,
        actualRowCount: ws.actualRowCount || 0,
        actualColumnCount: ws.actualColumnCount || 0,
        state: ws.state || "visible",
      },
    };
  });
}

/**
 * Nama sheet Excel yang valid & unik.
 *
 * Batas keras Excel: 31 karakter, karakter terlarang \ / ? * [ ] : , dan nama
 * tidak boleh sama antar-sheet. Nama hasil import sering lebih dari 31 karakter
 * (mis. "LK Neraca Terintegrasi 2020-2024@READ ME") sehingga harus dipotong,
 * dan pemotongan bisa menghasilkan nama kembar — karena itu nomorannya
 * ditambahkan dengan tetap menjaga panjang &lt;= 31.
 */
function uniqueSheetName(rawName, used) {
  const base =
    String(rawName == null ? "" : rawName)
      .replace(/[\\/?*[\]:]/g, " ")
      .trim()
      .slice(0, 31)
      .trim() || "Sheet";
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase());
    return base;
  }
  let n = 2;
  for (;;) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, 31 - suffix.length).trim() + suffix;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
    n++;
    if (n > 9999) return base.slice(0, 31); // jaring pengaman
  }
}

// ---------- Rekonstruksi workbook dari baris data yang sudah ada ----------

// Kunci kolom standar data_barang -> label di sheet hasil rekonstruksi.
const STD_COLS = [
  { key: "kode", label: "KODE", type: "text" },
  { key: "nama", label: "NAMA", type: "text" },
  { key: "jumlah", label: "JUMLAH", type: "number" },
  { key: "harga", label: "HARGA", type: "number" },
  { key: "total", label: "TOTAL", type: "number" },
  { key: "tanggal", label: "TANGGAL", type: "date" },
  { key: "status", label: "STATUS", type: "text" },
  { key: "keterangan", label: "KETERANGAN", type: "text" },
];

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function colLetter(n) {
  let x = Number(n) || 1;
  let s = "";
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/**
 * Bangun workbook .xlsx dari baris data yang SUDAH ADA di database.
 *
 * Dipakai untuk file hasil import versi lama yang byte aslinya tidak pernah
 * disimpan di disk (jadi tidak ada yang bisa dihapus atau hilang, datanya tetap
 * ada di MySQL). Workbook hasil rekonstruksi disimpan ke disk sekali saja lalu
 * ditandai reconstructed=1, sehingga file tersebut juga permanen seperti
 * file hasil import baru.
 *
 * PENTING: ini bukan sumber data baru. Baris data tetap hidup di
 * `spreadsheet` + `data_barang`; file ini hanya bentuk file yang bisa dibuka
 * ulang di halaman Spreadsheet.
 */
async function buildWorkbookFromDatabase(workbookCode) {
  const [[file]] = await pool.query(
    "SELECT id, nama_file FROM workbook_files WHERE workbook_code = ?",
    [workbookCode]
  );
  if (!file) return null;

  // Nama sheet di DB hasil publish berbentuk "<fileStem>@<namaSheet>". Ambil
  // bagian <namaSheet>-nya saja ketika membangun workbook, supaya nama sheet
  // tidak terpotong 31 karakter dan berubah jadi " (2)", " (3)", dst.
  // Catatan: hanya buang ekstensi spreadsheet yang dikenal. Nama file bisa
  // mengandung titik (mis. "1. LK Neraca ...") yang BUKAN ekstensi.
  const stemRaw = String(file.nama_file || "")
    .trim()
    .replace(/\.(xlsx|xlsm|xls|csv)$/i, "")
    .trim();
  const sheetDisplayName = (namaSheet, namaSp) => {
    const raw = String(namaSheet || namaSp || "Sheet").trim() || "Sheet";
    if (stemRaw && raw.startsWith(stemRaw + "@")) return raw.slice(stemRaw.length + 1) || "Sheet";
    return raw;
  };

  const [sheets] = await pool.query(
    `SELECT ws.sheet_code, ws.nama_sheet, ws.sheet_index, ws.hidden, ws.spreadsheet_id,
            sp.nama AS nama_sp, sp.kolom
     FROM workbook_sheets ws
     LEFT JOIN spreadsheet sp ON sp.id = ws.spreadsheet_id
     WHERE ws.workbook_id = ? AND ws.status = 'aktif'
     ORDER BY ws.sheet_index`,
    [file.id]
  );
  if (!sheets.length) return null;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SISNERLING";
  wb.created = new Date();

  const usedNames = new Set();
  for (const s of sheets) {
    const safeName = uniqueSheetName(sheetDisplayName(s.nama_sheet, s.nama_sp), usedNames);
    const ws = wb.addWorksheet(safeName, {
      state: s.hidden ? "hidden" : "visible",
    });

    // Susunan kolom mengikuti definisi kolom sheet bila ada, agar nama kolom
    // sama persis dengan yang tampil di halaman Penugasan/Spreadsheet.
    const kolomCfg = parseJson(s.kolom, null);
    const cols = Array.isArray(kolomCfg) && kolomCfg.length
      ? kolomCfg.map((c) => ({
          key: String(c.key || ""),
          label: String(c.label || c.key || ""),
          type: String(c.type || "text"),
          width: Number(c.width) || null,
        }))
      : STD_COLS.map((c) => ({ ...c, width: null }));

    // Baris data milik sheet ini (data_barang.sheet_id = spreadsheet.id).
    const [rows] = s.spreadsheet_id
      ? await pool.query(
          `SELECT kode, nama, jumlah, harga, tanggal, status, keterangan, formulas, nilai
           FROM data_barang WHERE sheet_id = ? ORDER BY id`,
          [s.spreadsheet_id]
        )
      : [[]];

    // Kolom tambahan yang hanya muncul di `nilai` tetap dibuat agar data
    // eksploratif hasil import lama tidak ada yang hilang.
    const extraKeys = new Set();
    for (const r of rows) {
      for (const k of Object.keys(parseJson(r.nilai, {}) || {})) {
        if (k && !cols.some((c) => c.key === k)) extraKeys.add(k);
      }
    }
    for (const k of extraKeys) cols.push({ key: k, label: k, type: "text", width: null });

    cols.forEach((c, i) => {
      if (c.width) ws.getColumn(i + 1).width = Math.min(60, Math.max(10, c.width / 7));
    });

    ws.getRow(1).font = { bold: true };
    cols.forEach((c, i) => {
      ws.getCell(1, i + 1).value = c.label;
    });

    const STD_KEYS = new Set(STD_COLS.map((c) => c.key));
    rows.forEach((r, ri) => {
      const formulas = parseJson(r.formulas, {}) || {};
      const nilai = parseJson(r.nilai, {}) || {};
      // Satu objek row dipakai untuk seluruh kolom: jauh lebih cepat daripada
      // mengulang ws.getCell() untuk tiap kolom (workbook lama bisa ribuan baris).
      const row = ws.getRow(ri + 2);
      for (let ci = 0; ci < cols.length; ci++) {
        const c = cols[ci];
        const cell = row.getCell(ci + 1);
        const f = formulas[c.key];
        // Formula tersimpan sudah bergaya A1 (mis. "=C2*2") sehingga bisa
        // ditulis langsung sebagai formula Excel.
        if (typeof f === "string" && f.trim().startsWith("=")) {
          cell.value = { formula: f.trim().slice(1) };
          continue;
        }
        let v = STD_KEYS.has(c.key) ? r[c.key] : nilai[c.key];
        if (v === undefined || v === null) v = "";
        if (c.key === "total" && v === "") {
          v = (Number(r.jumlah) || 0) * (Number(r.harga) || 0);
        }
        if (c.key === "tanggal" && v) {
          const d = new Date(v);
          if (!Number.isNaN(d.getTime())) {
            cell.value = d;
            cell.numFmt = "yyyy-mm-dd";
          } else {
            cell.value = String(v);
          }
          continue;
        }
        if ((c.key === "jumlah" || c.key === "harga" || c.key === "total") && v !== "") {
          const n = Number(v);
          if (Number.isFinite(n)) {
            cell.value = n;
            cell.numFmt = "#,##0.##";
            continue;
          }
        }
        cell.value = typeof v === "object" ? JSON.stringify(v) : v;
      }
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---------- Router ----------

const router = express.Router();

// Router ini sudah dipasang setelah middleware global /api (authRequired +
// maintenanceGuard) di server.js. authRequired di sini sengaja diulang sebagai
// pagar pengaman agar router tetap aman bila nanti dipasang di tempat lain.
//
// Catatan body-parser: express.json global (limit 25mb) sudah menangani body
// sebelum router ini. File maksimal 10 MB → base64 ±13 MB, jauh di bawah 25 MB,
// jadi tidak perlu parser tambahan di sini.

/**
 * GET /api/files
 * Daftar SEMUA file yang pernah berhasil di-import, diambil dari database.
 * Inilah sumber data halaman "File & Import" — bukan dari React state.
 *
 * Setiap file juga membawa daftar sheet-nya sehingga Spreadsheet bisa tahu sheet
 * apa saja yang dimiliki workbook tersebut tanpa perlu unduh file dulu.
 */
router.get("/", async (_req, res, next) => {
  try {
    const [files] = await pool.query(
      `SELECT id, workbook_code, nama_file, original_name, size_bytes, mime, sha256,
              jumlah_sheet, status, uploaded_by, tanggal_import, created_at, updated_at,
              reconstructed,
              (stored_path IS NOT NULL AND stored_path <> '') AS punya_file
       FROM workbook_files
       WHERE status = 'aktif'
       ORDER BY id DESC`
    );
    const [sheets] = await pool.query(
      `SELECT id, workbook_id, sheet_code, nama_sheet, sheet_index, hidden,
              row_count, col_count, spreadsheet_id
       FROM workbook_sheets
       WHERE status = 'aktif'
       ORDER BY workbook_id, sheet_index`
    );
    const byWorkbook = new Map();
    for (const s of sheets) {
      if (!byWorkbook.has(s.workbook_id)) byWorkbook.set(s.workbook_id, []);
      byWorkbook.get(s.workbook_id).push({
        sheetId: s.sheet_code,
        id: s.id,
        namaSheet: s.nama_sheet,
        sheetIndex: s.sheet_index,
        hidden: !!s.hidden,
        rowCount: s.row_count,
        colCount: s.col_count,
        spreadsheetId: s.spreadsheet_id,
      });
    }
    res.json(
      files.map((f) => ({
        id: f.id,
        workbookCode: f.workbook_code,
        fileName: f.nama_file,
        originalName: f.original_name,
        sizeBytes: Number(f.size_bytes) || 0,
        mime: f.mime,
        jumlahSheet: f.jumlah_sheet,
        status: f.status,
        uploadedBy: f.uploaded_by,
        tanggalImport: f.tanggal_import,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        // Workbook dari backfill belum punya byte file sampai /content dibuka;
        // UI menandai ini agar pengguna tahu bedanya.
        punyaFile: !!f.punya_file,
        reconstructed: !!f.reconstructed,
        sheets: byWorkbook.get(f.id) || [],
      }))
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/files/:code
 * Metadata satu workbook + daftar sheet lengkap (termasuk merge & ukuran).
 */
router.get("/:code", async (req, res, next) => {
  try {
    const code = String(req.params.code || "");
    const [[file]] = await pool.query(
      `SELECT id, workbook_code, nama_file, original_name, size_bytes, jumlah_sheet,
              status, tanggal_import, updated_at, reconstructed,
              (stored_path IS NOT NULL AND stored_path <> '') AS punya_file
       FROM workbook_files WHERE workbook_code = ?`,
      [code]
    );
    if (!file) return res.status(404).json({ error: "File tidak ditemukan" });
    const [sheets] = await pool.query(
      `SELECT sheet_code, nama_sheet, sheet_index, hidden, row_count, col_count,
              merges, struktur, spreadsheet_id
       FROM workbook_sheets WHERE workbook_id = ? AND status = 'aktif' ORDER BY sheet_index`,
      [file.id]
    );
    res.json({
      id: file.id,
      workbookCode: file.workbook_code,
      fileName: file.nama_file,
      originalName: file.original_name,
      sizeBytes: Number(file.size_bytes) || 0,
      jumlahSheet: file.jumlah_sheet,
      status: file.status,
      tanggalImport: file.tanggal_import,
      updatedAt: file.updated_at,
      punyaFile: !!file.punya_file,
      reconstructed: !!file.reconstructed,
      sheets: sheets.map((s) => ({
        sheetId: s.sheet_code,
        namaSheet: s.nama_sheet,
        sheetIndex: s.sheet_index,
        hidden: !!s.hidden,
        rowCount: s.row_count,
        colCount: s.col_count,
        merges: typeof s.merges === "string" ? safeJson(s.merges, []) : s.merges || [],
        struktur: typeof s.struktur === "string" ? safeJson(s.struktur, null) : s.struktur,
        spreadsheetId: s.spreadsheet_id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

/**
 * GET /api/files/:code/content
 * Mengembalikan byte workbook sebagai base64.
 *
 * Inilah yang dipakai halaman Spreadsheet untuk membangun workbook:
 * File & Import → Database/Storage → Spreadsheet → Workbook asli → Sheet asli.
 * Tidak ada salinan workbook kedua; yang dibuka adalah file yang sama.
 *
 * Workbook yang byte aslinya belum pernah tersimpan (file dari versi lama)
 * dibangun ulang dari baris data yang SUDAH ADA di database, lalu langsung
 * disimpan ke disk. Jadi file lama juga menjadi permanen dan bisa dibuka lagi
 * tanpa data yang hilang.
 */
router.get("/:code/content", async (req, res, next) => {
  try {
    const code = String(req.params.code || "");
    let [[file]] = await pool.query(
      "SELECT id, workbook_code, nama_file, stored_path, original_path, size_bytes, mime, reconstructed FROM workbook_files WHERE workbook_code = ?",
      [code]
    );
    if (!file) return res.status(404).json({ error: "File tidak ditemukan" });

    let buffer = await readOriginalFile(file.stored_path);
    let rebuilt = false;

    if (!buffer) {
      // Byte belum pernah tersimpan: bangun dari baris data yang sudah ada.
      // Kemungkinan gagal (mis. workbook tanpa sheet sama sekali) -> beri
      // pesan jelas, jangan diam-diam mengembalikan file kosong.
      try {
        const generated = await buildWorkbookFromDatabase(code);
        if (generated) {
          const original = await writeOriginalFile(code, generated, "original");
          // Pertahankan byte ASLI yang benar-benar ada; kalau file aslinya
          // sudah tidak ada (mis. workbook rekonstruksi lama), arahkan
          // original_path ke byte yang baru dibangun agar tidak menggantung.
          const prevOriginal = await readOriginalFile(file.original_path);
          const originalPath = prevOriginal ? file.original_path : original.storedPath;
          await pool.query(
            "UPDATE workbook_files SET stored_path = ?, original_path = ?, size_bytes = ?, mime = ?, sha256 = ?, reconstructed = 1 WHERE workbook_code = ?",
            [
              original.storedPath,
              originalPath,
              original.sizeBytes,
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              original.sha256 || null,
              code,
            ]
          );
          buffer = generated;
          rebuilt = true;
          console.log(
            `[FILES] workbook ${code} ("${file.nama_file}") dibangun ulang dari data & disimpan permanen`
          );
        }
      } catch (rebuildErr) {
        console.error(`[FILES] rekonstruksi ${code} gagal:`, rebuildErr.message);
      }
    }

    if (!buffer) {
      return res.status(404).json({
        error:
          "Isi workbook belum tersedia. Workbook ini belum pernah diimport sebagai file dan datanya belum bisa dibangun ulang.",
      });
    }
    res.json({
      workbookCode: file.workbook_code,
      fileName: file.nama_file,
      mime: file.mime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: Number(file.size_bytes) || buffer.length,
      rebuiltFromDatabase: rebuilt,
      base64: buffer.toString("base64"),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/files/:code/original
 * Unduh byte ASLI hasil import (tidak pernah ditimpa hasil edit editor).
 * Dipakai untuk mengambil kembali file apa adanya beserta struktur aslinya.
 */
router.get("/:code/original", async (req, res, next) => {
  try {
    const code = String(req.params.code || "");
    const [[file]] = await pool.query(
      "SELECT nama_file, original_path, stored_path, mime FROM workbook_files WHERE workbook_code = ?",
      [code]
    );
    if (!file) return res.status(404).json({ error: "File tidak ditemukan" });
    const buffer =
      (await readOriginalFile(file.original_path)) || (await readOriginalFile(file.stored_path));
    if (!buffer) return res.status(404).json({ error: "Byte file asli tidak tersedia" });
    res.setHeader(
      "Content-Type",
      file.mime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.nama_file)}"`
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/files/:code/download
 * Unduh file Excel asli persis seperti yang di-import.
 */
router.get("/:code/download", async (req, res, next) => {
  try {
    const code = String(req.params.code || "");
    const [[file]] = await pool.query(
      "SELECT nama_file, stored_path, mime FROM workbook_files WHERE workbook_code = ?",
      [code]
    );
    if (!file) return res.status(404).json({ error: "File tidak ditemukan" });
    const buffer = await readOriginalFile(file.stored_path);
    if (!buffer) return res.status(404).json({ error: "Byte file asli tidak tersedia" });
    res.setHeader(
      "Content-Type",
      file.mime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.nama_file)}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/files
 * Simpan file Excel yang baru di-import secara permanen.
 *
 * Menerima JSON { base64, fileName } (base64 dipakai agar tidak perlu
 * dependency baru untuk multipart) lalu:
 *   1. memvalidasi ekstensi & ukuran,
 *   2. MENYIMPAN byte asli ke disk,
 *   3. membaca struktur workbook (nama/urutan/merge/ukuran sheet),
 *   4. membuat workbook_files + workbook_sheets dengan ID permanen.
 *
 * Bila file dengan nama yang sama sudah pernah di-import, file DIBAHARUI
 * (workbook_code & sheet_code yang sudah ada dipakai ulang) — bukan dibuat
 * duplikat — sehingga ID lama tetap terhubung ke Sheet/Row/Column/Formula/
 * Penugasan yang sudah ada.
 */
router.post("/", requireRole("super_admin"), async (req, res, next) => {
  try {
    const { base64, fileName } = req.body || {};
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "File Excel tidak ditemukan" });
    }
    const originalName = String(fileName || "Spreadsheet.xlsx").trim().slice(0, 255);
    const ext = path.extname(originalName).toLowerCase();
    if (ext && !ALLOWED_EXT.includes(ext)) {
      return res.status(400).json({
        error: "Format file tidak didukung. Gunakan file .xlsx atau .xls",
      });
    }
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) {
      return res.status(400).json({ error: "File kosong atau tidak valid" });
    }
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ error: "Ukuran file terlalu besar. Maksimal 10 MB." });
    }

    // Pastikan file benar-benar .xlsx yang bisa dibaca ExcelJS.
    let sheetsMeta;
    try {
      sheetsMeta = await extractWorkbookStructure(buffer);
    } catch {
      return res.status(400).json({ error: "File bukan format Excel (.xlsx) yang valid" });
    }
    if (!sheetsMeta.length) {
      return res.status(400).json({ error: "File tidak memiliki worksheet" });
    }

// Idempoten per nama file: re-import file yang sama memperbarui workbook
    // yang sudah ada, bukan membuat workbook baru setiap kali.
    //
    // Pencocokan mengabaikan ekstensi (lihat normWorkbookName), sehingga file
    // lama yang tercatat sebagai "1. LK Neraca ... Hutan" tetap dikenali saat
    // user meng-import "1. LK Neraca ... Hutan.xlsx". Tanpa ini, meng-import
    // ulang file yang sama akan membuat workbook kedua (duplikat) dan
    // workbook_code lama kehilangan hubungannya dengan penugasan Admin.
    const [allWorkbooks] = await pool.query(
      "SELECT id, workbook_code, nama_file, legacy_id FROM workbook_files ORDER BY id DESC"
    );
    const wanted = normWorkbookName(originalName);
    const existing = (allWorkbooks || []).find(
      (w) =>
        normWorkbookName(w.nama_file) === wanted || normWorkbookName(w.legacy_id) === wanted
    );

    let workbookId;
    let workbookCode;
    let created;
    if (existing && existing.id) {
      workbookId = existing.id;
      workbookCode = existing.workbook_code;
      created = false;
      // legacy_id ikut diisi agar backfill berikutnya tidak pernah membuat
      // workbook kedua untuk file yang sama.
      await pool.query(
        `UPDATE workbook_files
         SET original_name = ?, nama_file = ?, legacy_id = COALESCE(legacy_id, ?),
             status = 'aktif', tanggal_import = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [originalName, originalName, originalName, workbookId]
      );
    } else {
      workbookCode = await nextCode(pool, "workbook_files", "workbook_code", "WB_");
      const [ins] = await pool.query(
        `INSERT INTO workbook_files
           (workbook_code, nama_file, original_name, uploaded_by, jumlah_sheet, status)
         VALUES (?, ?, ?, ?, ?, 'aktif')`,
        [workbookCode, originalName, originalName, req.user.id, sheetsMeta.length]
      );
      workbookId = ins.insertId;
      created = true;
    }

    // Simpan byte file ASLI ke disk, apa adanya (tidak di-rebuild dari grid
    // editor), sehingga sheet, formula, merge, format, gambar, serta baris dan
    // kolom kosong tetap identik dengan file yang diupload.
    // Dipisah dari `stored_path` (byte yang boleh berubah karena edit) supaya
    // file asli tidak pernah tertimpa.
    const stored = await writeOriginalFile(workbookCode, buffer, "original");
    await pool.query(
      `UPDATE workbook_files
       SET stored_path = ?, original_path = ?, size_bytes = ?, mime = ?, sha256 = ?,
           jumlah_sheet = ?, reconstructed = 0
       WHERE id = ?`,
      [
        stored.storedPath,
        stored.storedPath,
        stored.sizeBytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        stored.sha256,
        sheetsMeta.length,
        workbookId,
      ]
    );
    // Bersihkan versi byte lama yang sudah tidak dirujuk.
    await pruneWorkbookDir(workbookCode, [stored.storedPath]).catch(() => {});

    // Daftarkan sheet. Sheet yang sudah ada (urutan sama) diperbarui supaya
    // sheet_code stabil dan relasi ke spreadsheet/penugasan tidak putus.
    const sheetResults = [];
    for (let i = 0; i < sheetsMeta.length; i++) {
      const meta = sheetsMeta[i];
      const mergesJson = JSON.stringify(meta.merges || []);
      const strukturJson = JSON.stringify(meta.struktur || {});
      const [[dup]] = await pool.query(
        "SELECT id, sheet_code FROM workbook_sheets WHERE workbook_id = ? AND sheet_index = ?",
        [workbookId, i]
      );
      if (dup && dup.id) {
        await pool.query(
          `UPDATE workbook_sheets
           SET nama_sheet = ?, hidden = ?, row_count = ?, col_count = ?, merges = ?,
               struktur = ?, status = 'aktif'
           WHERE id = ?`,
          [
            meta.namaSheet,
            meta.hidden,
            meta.rowCount,
            meta.colCount,
            mergesJson,
            strukturJson,
            dup.id,
          ]
        );
        sheetResults.push({ sheetId: dup.sheet_code, namaSheet: meta.namaSheet, sheetIndex: i });
      } else {
        const sheetCode = await nextCode(pool, "workbook_sheets", "sheet_code", "SHEET_");
        await pool.query(
          `INSERT INTO workbook_sheets
             (workbook_id, sheet_code, nama_sheet, sheet_index, hidden, row_count, col_count, merges, struktur)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            workbookId,
            sheetCode,
            meta.namaSheet,
            i,
            meta.hidden,
            meta.rowCount,
            meta.colCount,
            mergesJson,
            strukturJson,
          ]
        );
        sheetResults.push({ sheetId: sheetCode, namaSheet: meta.namaSheet, sheetIndex: i });
      }
    }

    // Sheet lama yang TIDAK ada lagi di file yang baru di-import diarsipkan
    // (status='hilang'), bukan dihapus — supaya re-import file dengan jumlah
    // sheet lebih sedikit tidak meninggalkan sheet "hantu" yang tampak seperti
    // duplikat. Barisnya & sheet_code-nya tetap ada sehingga referensi lama
    // (penugasan, progres, formula) tidak putus. Selaras dengan PUT /:code/content.
    await pool.query(
      "UPDATE workbook_sheets SET status = 'hilang' WHERE workbook_id = ? AND status = 'aktif' AND sheet_index >= ?",
      [workbookId, sheetsMeta.length]
    );

    logAudit({
      userId: req.user.id,
      action: "import",
      module: "files",
      description: `Import file "${originalName}" → ${workbookCode} (${sheetsMeta.length} sheet)`,
      newData: { workbookCode, fileName: originalName, sheets: sheetResults },
      req,
    });

    res.status(created ? 201 : 200).json({
      message: created ? "File berhasil disimpan permanen" : "File diperbarui",
      workbookCode,
      fileName: originalName,
      sizeBytes: stored.sizeBytes,
      jumlahSheet: sheetsMeta.length,
      sheets: sheetResults,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/files/:code/content
 * Simpan ulang byte workbook yang sudah diedit di halaman Spreadsheet.
 *
 * `workbook_code` TIDAK berubah, jadi draft, history, penugasan Admin, dan
 * formula antar-file tetap menunjuk workbook yang sama.
 *
 * Byte hasil edit disimpan sebagai `stored_path` (yang disajikan ke klien),
 * sedangkan `original_path` (byte apa adanya hasil import) TIDAK disentuh —
 * jadi struktur Excel asli tetap bisa diambil kembali kapan saja.
 *
 * Sheet yang hilang di editor diARSIPKAN (status='hilang'), bukan dihapus:
 * barisnya tetap ada dan sheet_code tidak pernah dipakai ulang, sehingga
 * referensi lama (penugasan, progres, formula) tidak ikut putus. Baris
 * `spreadsheet` & `data_barang` juga tidak dihapus di sini.
 */
router.put(
  "/:code/content",
  requireRole("super_admin"),
  async (req, res, next) => {
    try {
      const code = String(req.params.code || "");
      const base64 = String((req.body || {}).base64 || "");
      if (!base64) return res.status(400).json({ error: "Isi file tidak boleh kosong" });

      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) return res.status(400).json({ error: "Isi file tidak valid" });

      const [[file]] = await pool.query(
        "SELECT id, stored_path, original_path, reconstructed FROM workbook_files WHERE workbook_code = ?",
        [code]
      );
      if (!file) return res.status(404).json({ error: "File tidak ditemukan" });

      const sheets = await extractWorkbookStructure(buffer);
      if (!sheets.length) {
        return res.status(400).json({ error: "Workbook tidak memiliki sheet" });
      }

      // Tulis byte hasil edit ke folder workbook yang sama. (Bug sebelumnya:
      // nilai balik writeOriginalFile adalah objek, sedangkan kolom ini
      // menerima string — akibatnya stored_path berisi "[object Object]" dan
      // file tidak bisa dibuka lagi setelah diedit.)
      const written = await writeOriginalFile(code, buffer, "current");
      const storedPath = written.storedPath;
      const sizeBytes = written.sizeBytes;
      const sha256 = written.sha256;

      await pool.query(
        "UPDATE workbook_files SET stored_path = ?, size_bytes = ?, sha256 = ?, updated_at = NOW() WHERE id = ?",
        [storedPath, sizeBytes, sha256, file.id]
      );
      // Byte asli hasil import tetap dipertahankan.
      if (!file.original_path) {
        await pool.query("UPDATE workbook_files SET original_path = ? WHERE id = ?", [
          storedPath,
          file.id,
        ]);
      }
      // Buang hanya versi byte yang sudah tergantikan; original & current
      // yang baru selalu dipertahankan.
      await pruneWorkbookDir(code, [storedPath, file.original_path]).catch(() => {});

      // Sinkronkan daftar sheet: pertahankan sheet_code yang sudah ada (ID
      // stabil) supaya referensi lama tidak putus.
      const [existingSheets] = await pool.query(
        "SELECT id, sheet_code, nama_sheet FROM workbook_sheets WHERE workbook_id = ? ORDER BY sheet_index",
        [file.id]
      );
      const byName = new Map();
      for (const s of existingSheets) {
        byName.set(String(s.nama_sheet || "").toLowerCase(), s);
      }

      for (const s of sheets) {
        const prev = byName.get(String(s.namaSheet || "").toLowerCase());
        if (prev) {
          await pool.query(
            "UPDATE workbook_sheets SET nama_sheet = ?, sheet_index = ?, hidden = ?, row_count = ?, col_count = ?, merges = ?, struktur = ?, status = 'aktif' WHERE id = ?",
            [
              s.namaSheet,
              s.sheetIndex,
              s.hidden,
              s.rowCount,
              s.colCount,
              JSON.stringify(s.merges || []),
              JSON.stringify(s.struktur || {}),
              prev.id,
            ]
          );
          byName.delete(String(s.namaSheet || "").toLowerCase());
        } else {
          const sheetCode = await nextSheetCode();
          await pool.query(
            "INSERT INTO workbook_sheets (workbook_id, sheet_code, nama_sheet, sheet_index, hidden, row_count, col_count, merges, struktur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              file.id,
              sheetCode,
              s.namaSheet,
              s.sheetIndex,
              s.hidden,
              s.rowCount,
              s.colCount,
              JSON.stringify(s.merges || []),
              JSON.stringify(s.struktur || {}),
            ]
          );
        }
      }

      // Sheet yang benar-benar tidak ada lagi di workbook (bukan sekadar
      // disembunyikan): diarsipkan, TIDAK dihapus.
      for (const leftover of byName.values()) {
        await pool.query("UPDATE workbook_sheets SET status = 'hilang' WHERE id = ?", [
          leftover.id,
        ]);
      }

      res.json({
        message: "Isi workbook tersimpan",
        workbookCode: code,
        sizeBytes,
        jumlahSheet: sheets.length,
        sheets: sheets.map((s) => ({ namaSheet: s.namaSheet, sheetIndex: s.sheetIndex })),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/files/:code
 * Ubah nama file. Nama adalah identitas tampilan; workbook_code TIDAK pernah
 * berubah sehingga seluruh relasi lama tetap utuh.
 */
router.put("/:code", requireRole("super_admin"), async (req, res, next) => {
  try {
    const code = String(req.params.code || "");
    const namaBaru = String((req.body || {}).fileName || "").trim().slice(0, 255);
    if (!namaBaru) return res.status(400).json({ error: "Nama file tidak boleh kosong" });
    const [[file]] = await pool.query(
      "SELECT id, nama_file FROM workbook_files WHERE workbook_code = ?",
      [code]
    );
    if (!file) return res.status(404).json({ error: "File tidak ditemukan" });

    // Nama boleh sama dengan file lain (tidak ada UNIQUE), tapi JANGAN pernah
    // menimpa nama file lain — hanya ubah file ini.
    await pool.query("UPDATE workbook_files SET nama_file = ?, original_name = ? WHERE id = ?", [
      namaBaru,
      namaBaru,
      file.id,
    ]);
    res.json({ message: "Nama file diperbarui", workbookCode: code, fileName: namaBaru });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/files/:code
 * Hapus file. HANYA Super Admin, HANYA lewat permintaan eksplisit ini.
 * Tidak ada pemanggilan otomatis dari refresh/logout/restart.
 *
 * Baris data_barang milik sheet TIDAK dihapus (sama seperti perilaku
 * DELETE /api/spreadsheet/:id yang lama) supaya data manual & entri Admin
 * tidak ikut hilang. Yang dihapus hanya metadata file & sheet-nya.
 */
router.delete("/:code", requireRole("super_admin"), async (req, res, next) => {
  try {
    const code = String(req.params.code || "");
    const [[file]] = await pool.query(
      "SELECT id, nama_file, stored_path, original_path FROM workbook_files WHERE workbook_code = ?",
      [code]
    );
    if (!file) return res.status(404).json({ error: "File tidak ditemukan" });

    // Putuskan relasi spreadsheet → workbook (data spreadsheet & barisnya tetap).
    await pool.query("UPDATE spreadsheet SET workbook_id = NULL WHERE workbook_id = ?", [code]);
    // Metadata sheet ikut dihapus karena sudah tidak ada file induknya. Baris
    // `spreadsheet`, `data_barang`, dan aturan penugasan TIDAK dihapus.
    await pool.query("DELETE FROM workbook_sheets WHERE workbook_id = ?", [file.id]);
    await pool.query("DELETE FROM workbook_files WHERE id = ?", [file.id]);

    // Hapus byte file di disk (hanya untuk file yang benar-benar dihapus).
    try {
      const dir = path.resolve(STORAGE_ROOT, path.dirname(file.stored_path || file.original_path || code));
      if (dir.startsWith(path.resolve(STORAGE_ROOT))) {
        await fsp.rm(dir, { recursive: true, force: true });
      }
    } catch (_) {
      /* file di disk mungkin sudah hilang; metadata tetap terhapus */
    }

    logAudit({
      userId: req.user.id,
      action: "delete",
      module: "files",
      description: `Hapus file "${file.nama_file}" (${code})`,
      oldData: { workbookCode: code, fileName: file.nama_file },
      req,
    });

    res.json({ message: "File dihapus", workbookCode: code });
  } catch (err) {
    next(err);
  }
});

/**
 * Bangun byte untuk workbook yang belum punya file tersimpan (workbook dari
 * versi lama, yang datanya sudah ada di MySQL tapi byte aslinya tidak pernah
 * disimpan).
 *
 * Dipanggil setelah server listen dan SENGAJA tidak di-await: proses boot tidak
 * boleh tertahan, dan file tetap permanen karena hasilnya langsung ditulis ke
 * disk. Endpoint /content juga tetap punya jalur lazy untuk workbook yang belum
 * selesai dibangun.
 */
async function warmWorkbooksFromDatabase() {
  try {
    const [pending] = await pool.query(
      `SELECT workbook_code FROM workbook_files
       WHERE status = 'aktif' AND (stored_path IS NULL OR stored_path = '')`
    );
    for (const row of pending || []) {
      const code = row.workbook_code;
      try {
        const generated = await buildWorkbookFromDatabase(code);
        if (!generated) continue;
        const written = await writeOriginalFile(code, generated, "original");
        await pool.query(
          `UPDATE workbook_files
           SET stored_path = ?, original_path = COALESCE(original_path, ?), size_bytes = ?,
               mime = ?, reconstructed = 1
           WHERE workbook_code = ?`,
          [
            written.storedPath,
            written.storedPath,
            written.sizeBytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            code,
          ]
        );
        console.log(`[FILES] workbook ${code} disimpan permanen dari data yang sudah ada`);
      } catch (err) {
        console.error(`[FILES] workbook ${code} belum bisa dibangun:`, err.message);
      }
    }
  } catch (err) {
    console.error("[FILES] pemanasan workbook gagal (diabaikan):", err.message);
  }
}

module.exports = {
  filesRouter: router,
  STORAGE_ROOT,
  ensureStorageRoot,
  warmWorkbooksFromDatabase,
  extractWorkbookStructure,
  buildWorkbookFromDatabase,
  normWorkbookName,
  nextCode,
  writeOriginalFile,
  readOriginalFile,
  pruneWorkbookDir,
};