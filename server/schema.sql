CREATE TABLE IF NOT EXISTS kategori (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_kategori VARCHAR(100) NOT NULL UNIQUE,
  deskripsi TEXT NULL,
  icon VARCHAR(50) NULL,
  kolom JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sub_kategori (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kategori_id INT NOT NULL,
  nama VARCHAR(100) NOT NULL,
  deskripsi TEXT NULL,
  icon VARCHAR(50) NULL,
  urutan INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sub_kat (kategori_id, nama),
  FOREIGN KEY (kategori_id) REFERENCES kategori(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Spreadsheet untuk klasifikasi manual data hasil import Excel.
-- Setiap baris tabel ini = satu tab/sheet pada halaman Spreadsheet.
CREATE TABLE IF NOT EXISTS spreadsheet (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL UNIQUE,
  sumber_file VARCHAR(255) NULL,
  kolom JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Bagian/sub-tabel: pecahan dari satu spreadsheet (sheet) berbentuk VIEW.
-- Tidak menduplikasi data: baris_awal/baris_akhir mengacu ke posisi baris data
-- pada data_barang (diurutkan berdasarkan id) di sheet tsb, dan kolom (JSON)
-- membatasi daftar kolom yang dapat diisi admin. Rumus tetap bekerja karena
-- sel penyusunnya tetap berada di data_barang parent sheet.
CREATE TABLE IF NOT EXISTS spreadsheet_sections (
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
) ENGINE=InnoDB;

-- Penugasan berbasis CAKUPAN (workbook/sheet/kolom/baris/range/cell).
-- Hanya menyimpan REFERENSI ke workbook & sheet asli - tidak ada data/salinan.
-- Resolusi: aturan paling spesifik menang
--   workbook < sheet < column/row < range < cell
CREATE TABLE IF NOT EXISTS admin_assignment_scopes (
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
  data_start INT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_barang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(50) NOT NULL UNIQUE,
  nama VARCHAR(150) NOT NULL,
  kategori_id INT NULL,
  sub_kategori_id INT NULL,
  sheet_id INT NULL,
  jumlah INT NOT NULL DEFAULT 0,
  harga DECIMAL(15,2) NOT NULL DEFAULT 0,
  tanggal DATE NOT NULL DEFAULT (CURRENT_DATE),
  status ENUM('Masuk', 'Keluar', 'Pending') NOT NULL DEFAULT 'Pending',
  keterangan TEXT NULL,
  formulas JSON NULL,
  nilai JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_kategori FOREIGN KEY (kategori_id) REFERENCES kategori(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS statistical_modules (
  module_key VARCHAR(80) NOT NULL PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  workbook_key VARCHAR(255) NOT NULL UNIQUE,
  source_file VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS statistical_sheets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(80) NOT NULL,
  nama VARCHAR(150) NOT NULL,
  urutan INT NOT NULL,
  max_row INT NOT NULL,
  max_col INT NOT NULL,
  permission_sheet_id INT NOT NULL,
  merges JSON NULL,
  column_widths JSON NULL,
  row_heights JSON NULL,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_stat_sheet (module_key, nama),
  KEY idx_stat_module (module_key, urutan),
  CONSTRAINT fk_stat_module FOREIGN KEY (module_key)
    REFERENCES statistical_modules(module_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS statistical_cells (
  sheet_id INT NOT NULL,
  row_no INT NOT NULL,
  col_no INT NOT NULL,
  jenis ENUM('input','formula','static') NOT NULL,
  nilai JSON NULL,
  nilai_awal JSON NULL,
  hasil JSON NULL,
  formula LONGTEXT NULL,
  formula_fallback TINYINT(1) NOT NULL DEFAULT 0,
  external_formula TINYINT(1) NOT NULL DEFAULT 0,
  number_format VARCHAR(100) NULL,
  versi BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sheet_id, row_no, col_no),
  KEY idx_stat_cell_type (sheet_id, jenis),
  CONSTRAINT fk_stat_cell_sheet FOREIGN KEY (sheet_id)
    REFERENCES statistical_sheets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jejak ramah-isi sel statistik per modul. Dipakai memuat cepat saat start:
-- jika nilai/rumus/sheet tidak berubah sejak boot terakhir, kalkulasi ulang
-- (yang butuh puluhan detik) dapat dilewati dengan aman.
CREATE TABLE IF NOT EXISTS statistical_module_state (
  module_key VARCHAR(80) NOT NULL PRIMARY KEY,
  seed_hash CHAR(64) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stat_state_module FOREIGN KEY (module_key)
    REFERENCES statistical_modules(module_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Riwayat perubahan rumus sel statistik. Menyimpan rumus & hasil lama sebagai
-- backup sehingga Super Admin dapat memulihkannya lewat dialog editor rumus.
CREATE TABLE IF NOT EXISTS statistical_formula_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sheet_id INT NOT NULL,
  row_no INT NOT NULL,
  col_no INT NOT NULL,
  old_formula LONGTEXT NULL,
  new_formula LONGTEXT NULL,
  old_hasil JSON NULL,
  changed_by INT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stat_hist_cell (sheet_id, row_no, col_no),
  CONSTRAINT fk_stat_hist_sheet FOREIGN KEY (sheet_id)
    REFERENCES statistical_sheets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS riwayat (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kategori_id INT NULL,
  aksi ENUM('simpan','hapus','hapus_semua','pulihkan','import') NOT NULL DEFAULT 'simpan',
  catatan VARCHAR(255) NULL,
  data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Akun user untuk autentikasi (Login/Register Logout).
-- Password disimpan hanya sebagai hash (bcrypt), TIDAK pernah dalam bentuk plain text.
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  avatar MEDIUMTEXT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Audit log: catatan seluruh aktivitas penting pengguna (siapa, apa, kapan,
-- terhadap data apa, dan perubahan sebelum/sesudah bila ada).
CREATE TABLE IF NOT EXISTS audit_logs (
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
<<<<<<< HEAD
  is_saved TINYINT(1) NOT NULL DEFAULT 0,
=======
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  archived_at TIMESTAMP NULL,
  archived_by INT NULL,
  restored_at TIMESTAMP NULL,
  restored_by INT NULL,
  source_log_id INT NULL,
>>>>>>> 1f7ba671be2dbad36d5988aecd9014a3e13cc3da
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_audit_user (user_id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_module (module),
  KEY idx_audit_action (action),
  KEY idx_audit_archived (is_archived),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Snapshot riwayat pemulihan / version history data terpisah dari log aktif.
-- Memastikan data pemulihan tidak terhapus saat pembersihan retensi log 72 jam.
CREATE TABLE IF NOT EXISTS audit_restore_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  audit_log_id INT NULL,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NULL,
  snapshot_before JSON NULL,
  snapshot_after JSON NULL,
  metadata JSON NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  restored_at TIMESTAMP NULL,
  restored_by INT NULL,
  KEY idx_ars_audit (audit_log_id),
  KEY idx_ars_target (target_type, target_id),
  KEY idx_ars_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesi login. Token dapat dihapus (logout) untuk mencabut akses secara server-side.
CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- TASK 3: inventaris logis (generic long-format + rule engine)
-- Didefinisikan di _analisis/skema-db-task3.md; diisi oleh
-- server/scripts/build-inventaris.js
-- =====================================================================

CREATE TABLE IF NOT EXISTS dim_tahun (
  tahun INT NOT NULL PRIMARY KEY,
  tahun_label VARCHAR(16) NOT NULL,
  status ENUM('tetap','sementara','sangat_sementara') NOT NULL DEFAULT 'tetap',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventaris_file (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(10) NOT NULL UNIQUE,
  nama VARCHAR(191) NOT NULL,
  workbook_key VARCHAR(255) NULL,
  source_file VARCHAR(255) NOT NULL,
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventaris_sheet (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_id INT NOT NULL,
  nama VARCHAR(191) NOT NULL,
  urutan INT NOT NULL DEFAULT 0,
  peran ENUM('primary','parameter','dokumentasi','skema','induk') NULL,
  stat_sheet_id INT NULL,
  UNIQUE KEY uk_inv_sheet (file_id, nama),
  KEY idx_inv_sheet_file (file_id),
  FOREIGN KEY (file_id) REFERENCES inventaris_file(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventaris_tabel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sheet_id INT NOT NULL,
  blok_no INT NOT NULL,
  nama VARCHAR(191) NOT NULL,
  r1 INT NOT NULL,
  r2 INT NOT NULL,
  c1 INT NULL,
  c2 INT NULL,
  axis ENUM('tahun','triwulan','tunggal','teks','kosong') NOT NULL DEFAULT 'tunggal',
  tahun_c1 INT NULL,
  tahun_c2 INT NULL,
  jenis ENUM('data','teks','helper','kosong') NOT NULL DEFAULT 'data',
  n_cell INT NULL,
  UNIQUE KEY uk_inv_tabel (sheet_id, blok_no),
  KEY idx_inv_tabel_sheet (sheet_id),
  FOREIGN KEY (sheet_id) REFERENCES inventaris_sheet(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventaris_variabel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tabel_id INT NOT NULL,
  row_no INT NOT NULL,
  nama VARCHAR(255) NOT NULL,
  nama_bersih VARCHAR(255) NULL,
  satuan VARCHAR(100) NULL,
  sumber VARCHAR(255) NULL,
  jenis_nilai ENUM('angka','teks','tanggal','kosong') NOT NULL DEFAULT 'angka',
  tipe ENUM('input_manual','hasil_formulasi','formula_tapi_input_manual') NOT NULL,
  n_sel INT NOT NULL DEFAULT 0,
  isian_sample VARCHAR(2048) NULL,
  rule_pengisian MEDIUMTEXT NULL,
  rule_parsed JSON NULL,
  refer_keluar JSON NULL,
  sel_direfer INT NOT NULL DEFAULT 0,
  status_verifikasi ENUM('kurasi','otomatis') NOT NULL DEFAULT 'otomatis',
  UNIQUE KEY uk_inv_var (tabel_id, row_no),
  KEY idx_inv_var_tipe (tipe),
  FOREIGN KEY (tabel_id) REFERENCES inventaris_tabel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventaris_cell_map (
  variabel_id INT NOT NULL,
  sheet_id INT NOT NULL,
  row_no INT NOT NULL,
  col_no INT NOT NULL,
  pos ENUM('data','label','axis','helper') NOT NULL DEFAULT 'data',
  PRIMARY KEY (sheet_id, row_no, col_no),
  KEY idx_cm_var (variabel_id),
  FOREIGN KEY (variabel_id) REFERENCES inventaris_variabel(id) ON DELETE CASCADE,
  FOREIGN KEY (sheet_id) REFERENCES inventaris_sheet(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventaris_dependensi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dari_variabel_id INT NOT NULL,
  ke_variabel_id INT NOT NULL,
  src_cell VARCHAR(60) NOT NULL,
  via_rule TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_dep (dari_variabel_id, ke_variabel_id, src_cell),
  KEY idx_dep_ke (ke_variabel_id),
  FOREIGN KEY (dari_variabel_id) REFERENCES inventaris_variabel(id) ON DELETE CASCADE,
  FOREIGN KEY (ke_variabel_id) REFERENCES inventaris_variabel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nilai_variabel (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  variabel_id INT NOT NULL,
  tahun INT NULL,
  periode VARCHAR(20) NULL,
  tahun_label VARCHAR(16) NULL,
  status_angka ENUM('tetap','sementara','sangat_sementara') NULL,
  pos VARCHAR(40) NULL,
  nilai JSON NULL,
  nilai_num DECIMAL(24,6) NULL,
  satuan VARCHAR(100) NULL,
  sumber VARCHAR(255) NULL,
  hasil_final TINYINT(1) NOT NULL DEFAULT 0,
  versi BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_nilai (variabel_id, tahun, periode, pos),
  KEY idx_nilai_var (variabel_id, hasil_final),
  KEY idx_nilai_thn (tahun),
  KEY idx_nilai_num (variabel_id, nilai_num),
  FOREIGN KEY (variabel_id) REFERENCES inventaris_variabel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nilai_variabel_revisi (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  nilai_id BIGINT NOT NULL,
  nilai_lama JSON NULL,
  nilai_baru JSON NULL,
  actor INT NULL,
  alasan VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_nvr_nilai (nilai_id),
  FOREIGN KEY (nilai_id) REFERENCES nilai_variabel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO kategori (id, nama_kategori, deskripsi) VALUES
  (1, 'Neraca Terintegrasi', 'Data neraca terintegrasi'),
  (2, 'Neraca Fisik & Moneter Hutan', 'Data neraca fisik & moneter hutan'),
  (3, 'Neraca Aset Mineral & Energi', 'Data neraca aset mineral & energi');

INSERT IGNORE INTO sub_kategori (kategori_id, nama, urutan) VALUES
  (3, 'Oil', 1),
  (3, 'Gas', 2),
  (3, 'Coal', 3),
  (3, 'Gold', 4),
  (3, 'Silver', 5),
  (3, 'Copper', 6),
  (3, 'Tin', 7),
  (3, 'Nickel', 8),
  (3, 'Bauxite', 9),
  (3, 'Mineral Lainnya', 10),
  (1, 'Kas & Bank', 1),
  (1, 'Piutang', 2),
  (1, 'Persediaan', 3),
  (1, 'Utang', 4),
  (2, 'Hutan Primer', 1),
  (2, 'Hutan Sekunder', 2),
  (2, 'Area Konservasi', 3),
  (2, 'Data Penunjang', 4),
  (2, 'Jati Jawa', 5),
  (2, 'Rimba Jawa', 6),
  (2, 'Rimba Luar Jawa', 7);
