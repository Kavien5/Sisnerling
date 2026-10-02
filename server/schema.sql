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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_audit_user (user_id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_module (module),
  KEY idx_audit_action (action),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Sesi login. Token dapat dihapus (logout) untuk mencabut akses secara server-side.
CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
