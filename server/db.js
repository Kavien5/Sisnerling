const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "sisnerling_db",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
};

const pool = mysql.createPool(config);

async function initDatabase() {
  const admin = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });

  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`
  );
  await admin.query(`USE \`${config.database}\`;`);

  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await admin.query(schema);

  await admin.query(
    `UPDATE kategori SET nama_kategori = 'Neraca Fisik & Moneter Hutan', deskripsi = 'Data neraca fisik & moneter hutan' WHERE nama_kategori = 'Pegawai'`
  );
  await admin.query(
    `UPDATE kategori SET nama_kategori = 'Neraca Aset Mineral & Energi', deskripsi = 'Data neraca aset mineral & energi' WHERE nama_kategori = 'Barang'`
  );
  await admin.query(
    `UPDATE kategori SET nama_kategori = 'Neraca Terintegrasi', deskripsi = 'Data neraca terintegrasi' WHERE nama_kategori = 'Keuangan'`
  );
  await admin.query(
    `DELETE FROM kategori WHERE nama_kategori = 'Lainnya'`
  );

  const [[col]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'data_barang' AND column_name = 'formulas'`
  );
  if (Number(col.n) === 0) {
    await admin.query("ALTER TABLE data_barang ADD COLUMN formulas JSON NULL");
  }

  const [[colNilai]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'data_barang' AND column_name = 'nilai'`
  );
  if (Number(colNilai.n) === 0) {
    await admin.query("ALTER TABLE data_barang ADD COLUMN nilai JSON NULL");
  }

  const [[colKolom]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'kategori' AND column_name = 'kolom'`
  );
  if (Number(colKolom.n) === 0) {
    await admin.query("ALTER TABLE kategori ADD COLUMN kolom JSON NULL");
  }

  const [[colJumlahType]] = await admin.query(
    `SELECT DATA_TYPE AS t FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'data_barang' AND column_name = 'jumlah'`
  );
  if (colJumlahType && colJumlahType.t && colJumlahType.t.toLowerCase() !== "bigint") {
    await admin.query("ALTER TABLE data_barang MODIFY COLUMN jumlah BIGINT NOT NULL DEFAULT 0");
  }

  const [[colSubKat]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'data_barang' AND column_name = 'sub_kategori_id'`
  );
  if (Number(colSubKat.n) === 0) {
    await admin.query("ALTER TABLE data_barang ADD COLUMN sub_kategori_id INT NULL");
  }

  const [[colSheetId]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'data_barang' AND column_name = 'sheet_id'`
  );
  if (Number(colSheetId.n) === 0) {
    await admin.query("ALTER TABLE data_barang ADD COLUMN sheet_id INT NULL");
  }

  const [[colIcon]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'kategori' AND column_name = 'icon'`
  );
  if (Number(colIcon.n) === 0) {
    await admin.query("ALTER TABLE kategori ADD COLUMN icon VARCHAR(50) NULL AFTER deskripsi");
  }

  const [[colSubIcon]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'sub_kategori' AND column_name = 'icon'`
  );
  if (Number(colSubIcon.n) === 0) {
    await admin.query("ALTER TABLE sub_kategori ADD COLUMN icon VARCHAR(50) NULL AFTER deskripsi");
  }

  const [[colAvatar]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'avatar'`
  );
  if (Number(colAvatar.n) === 0) {
    await admin.query("ALTER TABLE users ADD COLUMN avatar MEDIUMTEXT NULL");
  }

  // ---- RBAC: kolom role pada users (idempoten, tanpa DROP) ----
  const [[colRole]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role'`
  );
  if (Number(colRole.n) === 0) {
    await admin.query(
      "ALTER TABLE users ADD COLUMN role ENUM('user','admin','super_admin') NOT NULL DEFAULT 'user' AFTER email"
    );
  }

  // ---- Kolom password_plain: menyimpan password teks-biasa agar Super Admin
  // bisa melihatnya di halaman Manajemen User & Admin (idempoten) ----
  const [[colPwPlain]] = await admin.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'password_plain'`
  );
  if (Number(colPwPlain.n) === 0) {
    await admin.query("ALTER TABLE users ADD COLUMN password_plain VARCHAR(255) NULL");
  }

  // ---- Tabel pendukung: pengaturan, izin entry admin per tabel, backup ----
  await admin.query(`CREATE TABLE IF NOT EXISTS app_settings (
    skey VARCHAR(100) NOT NULL PRIMARY KEY,
    svalue JSON NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await admin.query(`CREATE TABLE IF NOT EXISTS admin_table_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tipe ENUM('kategori','spreadsheet') NOT NULL,
    tabel_id INT NOT NULL,
    section_id INT NULL,
    can_entry TINYINT(1) NOT NULL DEFAULT 1,
    can_edit TINYINT(1) NOT NULL DEFAULT 1,
    kolom_izin JSON NULL,
    baris_izin JSON NULL,
    asal ENUM('manual','scope') NOT NULL DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_perms (user_id, tipe, tabel_id, section_id),
    KEY idx_perms_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // ---- Sub-tabel (spreadsheet_sections) + izin granular per kolom/baris ----
  // Pastikan tabel spreadsheet_sections ada (definisi lengkap ada di schema.sql).
  await admin.query(`CREATE TABLE IF NOT EXISTS spreadsheet_sections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sheet_id INT NOT NULL,
    nama VARCHAR(150) NOT NULL,
    deskripsi TEXT NULL,
    baris_awal INT NULL,
    baris_akhir INT NULL,
    kolom JSON NULL,
    urutan INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_section_sheet (sheet_id, nama),
    KEY idx_section_sheet (sheet_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const ensureCol = async (table, col, ddl) => {
    const [[c]] = await admin.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [table, col]
    );
    if (Number(c.n) === 0) await admin.query(ddl);
  };
  await ensureCol("admin_table_permissions", "section_id",
    "ALTER TABLE admin_table_permissions ADD COLUMN section_id INT NULL AFTER tabel_id");
  await ensureCol("admin_table_permissions", "kolom_izin",
    "ALTER TABLE admin_table_permissions ADD COLUMN kolom_izin JSON NULL AFTER can_edit");
  await ensureCol("admin_table_permissions", "baris_izin",
    "ALTER TABLE admin_table_permissions ADD COLUMN baris_izin JSON NULL AFTER kolom_izin");
  // Asal baris izin: 'manual' (dibuat Super Admin di tabel izin lama) atau
  // 'scope' (dibuat otomatis oleh sistem aturan cakupan). Dipakai UI agar
  // baris yang sudah tak punya aturan induknya terlihat berbeda.
  await ensureCol("admin_table_permissions", "asal",
    "ALTER TABLE admin_table_permissions ADD COLUMN asal ENUM('manual','scope') NOT NULL DEFAULT 'manual' AFTER baris_izin");
  await ensureCol("spreadsheet", "sumber_file",
    "ALTER TABLE spreadsheet ADD COLUMN sumber_file VARCHAR(255) NULL AFTER nama");
  // Kolom yang dipakai endpoint publish workbook tapi belum ada di schema.sql
  // (tanpanya POST /api/import/workbook gagal dengan Unknown column).
  await ensureCol("spreadsheet", "worksheet_index",
    "ALTER TABLE spreadsheet ADD COLUMN worksheet_index INT NULL AFTER kolom");
  await ensureCol("spreadsheet", "hidden",
    "ALTER TABLE spreadsheet ADD COLUMN hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER worksheet_index");

  // Perluas indeks unik agar satu penugasan per (user, tipe, tabel, section).
  const [[uqRow]] = await admin.query(
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'admin_table_permissions' AND index_name = 'uq_perms'`
  );
  const uqCols = (uqRow && uqRow.cols ? String(uqRow.cols).toLowerCase() : "").split(",").map((s) => s.trim()).filter(Boolean).join(",");
  if (uqCols && uqCols !== "user_id,tipe,tabel_id,section_id") {
    await admin.query("ALTER TABLE admin_table_permissions DROP INDEX uq_perms");
    await admin.query(
      "CREATE UNIQUE INDEX uq_perms ON admin_table_permissions (user_id, tipe, tabel_id, section_id)"
    );
  }

  // ---- Penugasan berbasis cakupan (workbook/sheet/kolom/baris/range/cell) ----
  // Tabel BARU (tidak mengubah tabel/baris lama). Menyimpan aturan LOCK/UNLOCK
  // per Admin dengan referensi ke workbook & sheet ASLI (spreadsheet.id), bukan
  // salinan data. Progres tetap milik data sumber yang sama.
  await admin.query(`CREATE TABLE IF NOT EXISTS admin_assignment_scopes (
    id INT NOT NULL AUTO_INCREMENT,
    admin_id INT NOT NULL,
    workbook_key VARCHAR(255) NOT NULL,
    workbook_name VARCHAR(255) NOT NULL,
    sheet_id INT NULL,
    sheet_name VARCHAR(255) NULL,
    level ENUM('workbook','sheet','column','row','range','cell') NOT NULL,
    r1 INT NULL,
    c1 INT NULL,
    r2 INT NULL,
    c2 INT NULL,
    col_keys JSON NULL,
    status ENUM('lock','unlock') NOT NULL DEFAULT 'lock',
    can_entry TINYINT(1) NOT NULL DEFAULT 1,
    can_edit TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_scope_admin (admin_id),
    KEY idx_scope_sheet (sheet_id),
    KEY idx_scope_wb (workbook_key(191)),
    KEY idx_scope_level (level)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // ---- Backfill: data import lama (sheet_id NULL) dijadikan sheet otomatis ----
  // Data hasil import edisi lama tidak memiliki sheet. Agar tetap muncul di
  // halaman Penugasan Tabel, setiap kategori yang punya baris belum ber-sheet
  // dibuatkan satu spreadsheet (nama = nama kategori) lalu barisnya diikat.
  // Idempoten: jika baris sudah ber-sheet, tidak ada yang berubah.
  try {
    const [groups] = await admin.query(
      `SELECT d.kategori_id, k.nama_kategori, k.kolom, COUNT(*) AS n
       FROM data_barang d
       JOIN kategori k ON k.id = d.kategori_id
       WHERE d.sheet_id IS NULL
       GROUP BY d.kategori_id`
    );
    for (const g of groups) {
      const [[s]] = await admin.query("SELECT id FROM spreadsheet WHERE nama = ?", [g.nama_kategori]);
      let sheetId = s ? s.id : null;
      if (!sheetId) {
        const kolomJson = g.kolom && typeof g.kolom === "object" ? JSON.stringify(g.kolom) : null;
        const [r] = await admin.query("INSERT INTO spreadsheet (nama, kolom) VALUES (?, ?)", [g.nama_kategori, kolomJson]);
        sheetId = r.insertId;
      }
      await admin.query(
        "UPDATE data_barang SET sheet_id = ? WHERE kategori_id = ? AND sheet_id IS NULL",
        [sheetId, g.kategori_id]
      );
      console.log(`[BACKFILL] kategori "${g.nama_kategori}" → sheet #${sheetId} (${g.n} baris)`);
    }
  } catch (err) {
    console.error("[BACKFILL] gagal (dilewati):", err.message);
  }

  await admin.query(`CREATE TABLE IF NOT EXISTS backups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(200) NOT NULL,
    isi MEDIUMTEXT NULL,
    ukuran INT NOT NULL DEFAULT 0,
    dibuat_oleh INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);

  // ---- Audit log: jejak aktivitas penting pengguna ----
  await admin.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(50) NOT NULL,
    description VARCHAR(500) NULL,
    module VARCHAR(50) NOT NULL DEFAULT 'system',
    record_id INT NULL,
    old_data JSON NULL,
    new_data JSON NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(300) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_audit_user (user_id),
    KEY idx_audit_created (created_at),
    KEY idx_audit_module (module),
    KEY idx_audit_action (action),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // ---- Seed SUPER ADMIN (hanya bila variabel env diset & belum ada) ----
  const seedEmail = (process.env.SEED_SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const seedPass = process.env.SEED_SUPER_ADMIN_PASSWORD || "";
  if (seedEmail && seedPass) {
    const [[superCount]] = await admin.query(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'`
    );
    if (Number(superCount.n) === 0) {
      const [[dup]] = await admin.query("SELECT id FROM users WHERE email = ?", [seedEmail]);
      const nama = (process.env.SEED_SUPER_ADMIN_NAMA || "Super Admin").trim();
      const hash = await bcrypt.hash(seedPass, 10);
      if (dup) {
        await admin.query("UPDATE users SET role = 'super_admin', password_hash = ?, password_plain = ? WHERE id = ?", [hash, seedPass, dup.id]);
      } else {
        await admin.query(
          "INSERT INTO users (nama, email, password_hash, password_plain, role) VALUES (?, ?, ?, ?, 'super_admin')",
          [nama, seedEmail, hash, seedPass]
        );
      }
      console.log(`Super Admin siap: ${seedEmail} (via SEED_* env)`);
    }
  }

  // Indeks tabel sessions (dibuat dengan pengecekan agar idempoten).
  const ensureIndex = async (table, index, cols) => {
    const [[idx]] = await admin.query(
      `SELECT COUNT(*) AS n FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [table, index]
    );
    if (Number(idx.n) === 0) {
      await admin.query(
        `CREATE INDEX \`${index}\` ON \`${table}\` (${cols})`
      );
    }
  };
  await ensureIndex("sessions", "idx_sessions_token", "token");
  await ensureIndex("sessions", "idx_sessions_user", "user_id");

  // ---- Kolaborasi multi-user (Fase 1): hak akses per file, versioning baris,
  // revisi snapshot per sheet. Idempoten, tidak mengubah tabel/baris lama. ----
  // workbook_key = identitas file (spreadsheet.sumber_file / fileStem).
  await admin.query(`CREATE TABLE IF NOT EXISTS file_shares (
    id INT AUTO_INCREMENT PRIMARY KEY,
    workbook_key VARCHAR(255) NOT NULL,
    user_id INT NOT NULL,
    peran ENUM('viewer','editor') NOT NULL DEFAULT 'viewer',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_share (workbook_key(191), user_id),
    KEY idx_share_user (user_id),
    CONSTRAINT fk_share_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Optimistic locking per baris data: klien mengirim base_versi, server
  // menolak (409) bila versi sudah berubah oleh pengguna lain.
  await ensureCol("data_barang", "versi",
    "ALTER TABLE data_barang ADD COLUMN versi INT NOT NULL DEFAULT 1");
  await ensureCol("data_barang", "updated_by",
    "ALTER TABLE data_barang ADD COLUMN updated_by INT NULL");
  await ensureIndex("data_barang", "idx_data_sheet", "sheet_id");

  // Snapshot isi sheet per revisi (untuk banding & pulihkan versi).
  await admin.query(`CREATE TABLE IF NOT EXISTS sheet_revisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sheet_id INT NOT NULL,
    versi_no INT NOT NULL DEFAULT 1,
    data MEDIUMTEXT NULL,
    jumlah_baris INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_rev_sheet (sheet_id),
    CONSTRAINT fk_rev_sheet FOREIGN KEY (sheet_id) REFERENCES spreadsheet(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await admin.end();
}

module.exports = { pool, initDatabase };
