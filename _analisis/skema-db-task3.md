# Task 3 -- Desain Skema DB: Generic Long-Format + Rule Engine

Tanggal: 2026-10-13
Sumber data: `_analisis/inventaris-variabel.md` (batch-1: F1 Bond + F2 LK Terintegrasi) dan `_analisis/inventaris-variabel-2.md` (batch-2: F3 Hutan + F4 Mineral & Energi, sudah kurasi manual).
Keputusan: **DB generic long-format** sebagai sumber kebenaran logis, **rule engine** sebagai penghitung. Dokumen ini = desain saja (belum ada perubahan DB/server).

---

## 1. Konteks dan prinsip

Aplikasi sudah punya engine per-cell (`statistical_modules` → `statistical_sheets` → `statistical_cells`, lihat `server/statisticalSpreadsheet.js`) yang menyimpan Excel apa adanya dan bisa mengevaluasi rumus (evaluator di `client/src/spreadsheet.js`). Masalahnya: engine itu *mirror bentuk Excel* (cell = input/formula/static), bukan *model data logis*. Admin mengisi angka per-cell, dan rumus sulit dipahami sebagai variabel.

Model logis yang diinginkan (dari 2 dokumen inventaris ~1.992 baris variabel):

| Tipe inventaris | Jumlah (F3+F4) | Perilaku di web |
|---|---|---|
| `input manual` | ±976 | Form input (teks/angka/tanggal) |
| `hasil formulasi` | ±1.015 | **Tidak diinput**; dihitung engine dari variabel lain (termasuk antar-sheet & antar-file) |
| `formula tapi input manual` | ±24 | Form input **wajib** (nilai statistik luar: BPS/KLHK/Perhutani/harga acuan/Lakin) |

Prinsip:

1. **Satu atom = `nilai_variabel(variabel, tahun[, periode])`.** Baris variabel lebar (kolom = tahun) dinormalkan jadi banyak baris nilai.
2. **Formula tidak disimpan per-cell, melainkan per-variabel** (rule JSON) + **DAG dependensi**. Evaluasi = topo-sort; engine yang sama tetap dipakai untuk aritmetika.
3. **Worksheet render = turunan.** `statistical_cells` tetap jadi lapisan render/Excel-faithful; `nilai_variabel` adalah kebenaran logis. Sinkron dijelaskan di §7.
4. **SATU skema untuk semua sheet** (Bond, LK Terintegrasi, Hutan, Mineral) -- tidak ada 60 tabel bespoke.

---

## 2. Peta lapisan data

```
┌─────────────────────────────────────────────────────────────┐
│ UI (form variabel per tabel logis, lihat inventaris)        │
├─────────────────────────────────────────────────────────────┤
│ LAPIS LOGIS (BARU)                                          │
│  nilai_variabel ← nilainya ADALAH data web                  │
│  rule engine: transitif, topo-sort via inventaris_dependensi│
├─────────────────────────────────────────────────────────────┤
│ KATALOG (BARU)                                              │
│  inventaris_file/sheet/tabel/variabel (+sumber, satuan)     │
│  → di-backfill otomatis dari 2 dokumen inventaris           │
├─────────────────────────────────────────────────────────────┤
│ MIRROR EXCEL (LAMA, TIDAK DIMIGRASI)                        │
│  statistical_modules/sheets/cells + collab lock             │
│  dipakai untuk: render bentuk, report as-is, audit          │
└─────────────────────────────────────────────────────────────┘
```

Kaitan ke warna kategori/UI lama: `data_barang`/`spreadsheet`/`spreadsheet_sections`/`riwayat` **tidak dipakai** model ini; biarkan untuk fitur lama yang masih berjalan, atau diarsipkan (keputusan §9).

---

## 3. DDL baru

Semua `utf8mb4_unicode_ci`, `InnoDB`.

### 3.1 dim_tahun

```sql
CREATE TABLE IF NOT EXISTS dim_tahun (
  tahun INT NOT NULL PRIMARY KEY,
  tahun_label VARCHAR(16) NOT NULL,
  status ENUM('tetap','sementara','sangat_sementara') NOT NULL DEFAULT 'tetap',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- backfill: 1990..2024 dari F3 (1990-2016) & F4 (2008-2024) & F2 (2014-2024);
-- label & status untuk "2023*"/"2024**".
```

### 3.2 Katalog inventaris

```sql
CREATE TABLE IF NOT EXISTS inventaris_file (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(10) NOT NULL UNIQUE,          -- F1..F4
  nama VARCHAR(191) NOT NULL,                -- "LK Neraca Fisik & Moneter Hutan"
  workbook_key VARCHAR(255) NULL,            -- link ke statistical_modules.workbook_key
  source_file VARCHAR(255) NOT NULL,
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventaris_sheet (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_id INT NOT NULL,
  nama VARCHAR(191) NOT NULL,                -- nama sheet asli apa adanya (spasi akhiran dst.)
  urutan INT NOT NULL DEFAULT 0,
  peran ENUM('primary','parameter','dokumentasi','skema','induk') NULL,
  stat_sheet_id INT NULL,                    -- FK optional ke statistical_sheets.id (mirror)
  UNIQUE KEY uk_inv_sheet (file_id, nama),
  KEY idx_inv_sheet_file (file_id),
  FOREIGN KEY (file_id) REFERENCES inventaris_file(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- peran di-backfill dari MODULES di statisticalSpreadsheet.js:
--   F3 primary = Jati Jawa, Rimba Jawa, Rimba Luar Jawa, Indonesia, Rekap Hutan Indonesia
--   F3 parameter = Data Penunjang; F4 primary = 9 komoditas; F4 parameter = Lakin, Conversion Factor, Harga Acuan
--   Home/Notes/README Boleh = dokumentasi; Rekap/Hutan Indonesia = induk (agregasi).

CREATE TABLE IF NOT EXISTS inventaris_tabel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sheet_id INT NOT NULL,
  blok_no INT NOT NULL,                      -- nomor blok logis dari kurasi (1..n)
  nama VARCHAR(191) NOT NULL,                -- nama kurasi, mis. "2a. Neraca Fisik Indonesia (000 m3)"
  r1 INT NOT NULL,
  r2 INT NOT NULL,
  c1 INT NULL,                               -- kolom isi pertama (logis), bisa NULL utk teks
  c2 INT NULL,
  axis ENUM('tahun','triwulan','tunggal','teks','kosong') NOT NULL DEFAULT 'tunggal',
  tahun_c1 INT NULL,                         -- span tahun bila axis='tahun' (dari deteksi header)
  tahun_c2 INT NULL,
  jenis ENUM('data','teks','helper','kosong') NOT NULL DEFAULT 'data',
  n_cell INT NULL,                           -- total sel isi (debug/QA)
  UNIQUE KEY uk_inv_tabel (sheet_id, blok_no),
  KEY idx_inv_tabel_sheet (sheet_id),
  FOREIGN KEY (sheet_id) REFERENCES inventaris_sheet(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventaris_variabel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tabel_id INT NOT NULL,
  row_no INT NOT NULL,                       -- nomor baris Excel (R#)
  nama VARCHAR(255) NOT NULL,                -- nama hasil kurasi (masih bisa bawa satuan/sumber)
  nama_bersih VARCHAR(255) NULL,             -- nama setelah satuan/sumber dipisah (lihat §9)
  satuan VARCHAR(100) NULL,
  sumber VARCHAR(255) NULL,
  jenis_nilai ENUM('angka','teks','tanggal','kosong') NOT NULL DEFAULT 'angka',
  tipe ENUM('input_manual','hasil_formulasi','formula_tapi_input_manual') NOT NULL,
  n_sel INT NOT NULL DEFAULT 0,              -- dari kolom Isian (n=...)
  isian_sample VARCHAR(2048) NULL,           -- contoh nilai dari dokumen (QA/render awal)
  rule_pengisian MEDIUMTEXT NULL,            -- teks mentah: kutipan rumus / aturan + format
  rule_parsed JSON NULL,                     -- {"op":"sum","refs":[{"sheet":"Data Penunjang","r":15,"c":2,..}], "expr":"..."}
  refer_keluar JSON NULL,                    -- daftar sheet/cell yang dirujuk KELUAR (analisis)
  sel_direfer INT NOT NULL DEFAULT 0,        -- jumlah sel downstream "Akan direfer (X sel)"
  status_verifikasi ENUM('kurasi','otomatis') NOT NULL DEFAULT 'otomatis',
  UNIQUE KEY uk_inv_var (tabel_id, row_no),
  KEY idx_inv_var_tipe (tipe),
  FOREIGN KEY (tabel_id) REFERENCES inventaris_tabel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pemetaan sel Excel -> variabel logis (diperlukan rule engine & reverse ref).
-- Satu baris variabel mencakup banyak kolom (axis tahun/triwulan).
CREATE TABLE IF NOT EXISTS inventaris_cell_map (
  variabel_id INT NOT NULL,
  sheet_id INT NOT NULL,
  row_no INT NOT NULL,
  col_no INT NOT NULL,
  pos ENUM('data','label','axis','helper') NOT NULL,
  PRIMARY KEY (sheet_id, row_no, col_no),
  KEY idx_cm_var (variabel_id),
  FOREIGN KEY (variabel_id) REFERENCES inventaris_variabel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DAG dependensi antar-variabel. Built otomatis dari rule_parsed + kolom
-- "Akan direfer oleh" (reverse refs) / "Refer keluar" saat import.
CREATE TABLE IF NOT EXISTS inventaris_dependensi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dari_variabel_id INT NOT NULL,             -- SUMBER (yang dibaca rumus)
  ke_variabel_id INT NOT NULL,               -- PEMAKAI
  src_cell VARCHAR(60) NOT NULL,             -- contoh "Data Penunjang!B12" (tracer)
  via_rule TINYINT(1) NOT NULL DEFAULT 1,    -- 1 = lewat formula, 0 = lewat reverse-doc
  UNIQUE KEY uk_dep (dari_variabel_id, ke_variabel_id, src_cell),
  KEY idx_dep_ke (ke_variabel_id),
  FOREIGN KEY (dari_variabel_id) REFERENCES inventaris_variabel(id) ON DELETE CASCADE,
  FOREIGN KEY (ke_variabel_id) REFERENCES inventaris_variabel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.3 Nilai

```sql
CREATE TABLE IF NOT EXISTS nilai_variabel (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  variabel_id INT NOT NULL,
  tahun INT NULL,                            -- axis tahun; NULL bila teks/tunggal
  periode VARCHAR(20) NULL,                  -- 'T1'..'T4' / 'Q1'..'Q4' / 'in'/'out'/NULL
  tahun_label VARCHAR(16) NULL,              -- raw header mis. "2023*"
  status_angka ENUM('tetap','sementara','sangat_sementara') NULL,
  pos VARCHAR(40) NULL,                      -- bila variabel punya >1 seri sebaris (helper N/O/S/V)
  nilai JSON NULL,                           -- encodeValue-style: {"num":123} / teks / {"$date":..}
  nilai_num DECIMAL(24,6) NULL,              -- filter/sort numerik
  satuan VARCHAR(100) NULL,
  sumber VARCHAR(255) NULL,
  hasil_final TINYINT(1) NOT NULL DEFAULT 0, -- 0 = draft/input belum final, 1 = sudah lewat engine
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

-- Revisi riwayat (opsional, alternatif: andalkan audit_logs). Menyimpan delta per nilai.
CREATE TABLE IF NOT EXISTS nilai_variabel_revisi (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  nilai_id BIGINT NOT NULL,
  nilai_lama JSON NULL,
  nilai_baru JSON NULL,
  actor INT NULL,
  alasan VARCHAR(500) NULL,
  timestamps TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_nvr_nilai (nilai_id),
  FOREIGN KEY (nilai_id) REFERENCES nilai_variabel(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Skala perkiraan: hutan ~34 sheet map, variabel F3 ≈ 800, F4 ≈ 1.100, F2 ≈ 400, F1 ≈ 20 → ±1.992 variabel; nilai ≈ 1.992 × rata-rata 27 kolom tahun ≈ 50-55 ribu baris `nilai_variabel` -- aman untuk MySQL.

---

## 4. Pemetaan tipe → perilaku

| tipe inventaris | import | edit/admin | hitung engine | sinkron statistic_cells |
|---|---|---|---|---|
| `input_manual` | insert nilai (sample) | ya | tidak | copy nilai ke cell bersangkutan (formula_fallback=0) |
| `hasil_formulasi` | nilai dihitung saat import | tidak (kunci) | **ya**, cascade | sel render = `hasil_final` hasil engine |
| `formula_tapi_input_manual` | wajib via form impor/API | ya, divalidasi (tahun+satuan+sumber+status_angka) | hanya jika rumusnya `=konstanta` | copy; sel ditandai `external_formula=1` |

Aturan penerjemahan dari dokumen:

- `Rule Pengisian` berisi kutipan rumus (`=D$3`), deteksi struktur (`satuan=`), format (`#,##0`, `0.00%`). Engine menyimpan ekstraksi sebagai `rule_parsed`.
- `refer_keluar` + kolom "Akan direfer (X sel)" → isi `inventaris_dependensi` (arah: variable yang dibaca → pemakai).
- Label/variabel bertitik `R#` dengan `jenis_nilai='teks'` → disimpan di `nilai_variabel` dengan `tahun=NULL` (hanya 1 nilai), kecuali baris label tahun berulang (header tahun) → `tahun` terisi.
- Baris `(kosong)` (hasil kurasi: 7 pada batch-2) → **tidak** dibuat variabel; cukup catat di `inventaris_tabel.n_cell` untuk QA.

---

## 5. Rule engine (evaluasi)

Kebutuhan: menghitung `hasil_formulasi` dari nilai variabel lain, termasuk **antar-sheet antar-file** (`[1]5. Penanaman!...`, `'Rimba Luar Jawa'!B8`), **year-span alignment** (kolom tahun berbeda antar tabel), dan shared formula.

Komponen (di `server/ruleEngine.js`, baru):

1. **Graph resolver** `buildGraph()`: dari `inventaris_dependensi`, buat topo-sort. Ketika sebuah input berubah → tentukan himpunan variabel terdampak (dependent transitif) → evaluasi dalam urutan topo.
2. **Resolver sel → nilai**: `resolveCell(sheet,row,col, ctx)` memakai `inventaris_cell_map` → variabel → nilai atas `ctx` (snapshot nilai aktif dalam 1 transaksi). Kolom bukan data (axis/label) dikembalikan sebagai teks.
3. **Year alignment**: saat formula membaca range kolom tahun (`'Rimba Luar Jawa'!B8:...`), map tahun referensi (dari `inventaris_tabel.tahun_c1..c2`) ke tahun pemakai. Jika tidak ada header tahun (mis. Data Penunjang), gunakan urutan kolom/label (mekanisme fallback seperti `findYearRuns` di `statisticalSpreadsheet.js`).
4. **Aritmetika**: pakai ulang parser/evaluator `client/src/spreadsheet.js` (sudah dipakai server via `getFormulaEngine()`) agar ekspresi `=D9*D9/SUM(...)` persis sama hasilnya dengan Excel/JS.
5. **Shared formula & master formula**: sudah beres di `_analisis/analyzer` (lead cell `shareType:"shared"`); rule engine cukup pakai `rule_pengisian` yang sudah dinormalisasi dari lead/master.
6. **Transaksi & idempotensi**: seluruh cascade dalam 1 transaksi; sebelum commit, tulis hasil ke `nilai_variabel` (dengan `hasil_final=1`, `updated_by` sistem) DAN update `statistical_cells.hasil` untuk mirror render.

Output rule_parsed (contoh nyata dari doc F2 Penyediaan):
```json
{ "op": "sum",
  "refs": [ {"sheet":"PDB ADHB","r":6,"c":2},{"sheet":"PDB ADHB","r":14,"c":2},{"sheet":"PDB ADHB","r":15,"c":2} ],
  "expr": "=B6+B14+B15" }
```

---

## 6. Interaksi dengan `statistical_cells` (mirror)

- `statistical_modules` F3/F4 dan `MODULES` di `statisticalSpreadsheet.js` **tetap** menjadi sumber render & lock.
- `inventaris_file.workbook_key` = `statistical_modules.workbook_key` (`sisnerling-statistical:neraca-hutan`, dst.); `inventaris_sheet.stat_sheet_id` = `statistical_sheets.id`.
- Alur dua arah:
  - **Import/backfill**: evaluator lama membaca workbook → hasil per-cell dilihat sebagai nilai awal `nilai_variabel` (mengisi `nilai`, `nilai_num`, `hasil_final`).
  - **Edit input**: admin menulis `nilai_variabel` (via form tabel logis) → engine recalc → mirror `statistical_cells` ikut diperbarui (agar tampilan "sheet asli" konsisten).
  - **Read/query**: menunya memakai model logis (variabel, bukan cell). Sheet asli tetap tersedia sebagai mode "lihat workbook" + audit.
- Cell `(kosong)` / helper tanpa label: jangan tampilkan di form logis; cukup di mirror.

---

## 7. Backfill / impor dari dokumen inventaris

Skrip idempoten (fase 1):

1. Parse `inventaris-variabel.md` + `inventaris-variabel-2.md` (format markdown tabel standar 8 kolom) → insert `inventaris_sheet`/`tabel`/`variabel` (+`rule_pengisian`, `n_sel`, `isian_sample`, `refer_keluar`, `tipe`).
2. Isi `inventaris_cell_map` dari (sheet, row, col): untuk setiap variabel dengan range isi (mis. `B6..O6`) → daftar col dibuka; col = tahun dari header tabel (`tahun_c1..c2`), pos='data'; sisanya label/axis.
3. Bangun `inventaris_dependensi` dua arah dari kolom "Akan direfer oleh" & `otherSheets`.
4. **Backfill nilai**: baca nilai per-cell aktual dari workbook (ExcelJS) / dari `statistical_cells` yang sudah ter-import, isi `nilai_variabel` (sample dulu → penuh).
5. `INSERT dim_tahun` dari semua header tahun terdeteksi (termasuk `2023*`/`2024**`; label & status).

Hasil akhir fase 1 = katalog + nilai siap untuk UI form & uji rule engine.

---

## 8. Endpoint/API impact (ringkas)

- `GET /api/inventory/:file/:sheet/tables` → katalog tabel logis (dari `inventaris_tabel`) untuk menu form.
- `GET /api/inventory/table/:tabelId/values?tahun=` → `nilai_variabel` terbaca.
- `PUT/POST /api/inventory/values` → simpan input `input_manual`/`formula_tapi_input_manual` → trigger rule engine cascade.
- `GET /api/inventory/variable/:id` → meta + dependensi + riwayat (dari `inventaris_dependensi`, `nilai_variabel_revisi`/`audit_logs`).
- Tidak mengubah API lama `statistical_*` (biarkan untuk render sheet).

---

## 9. Keputusan yang perlu di-confirm saat implementasi

1. **Pemisahan `satuan`/`sumber` dari nama variabel**: saat ini "glued" (mis. `Price / IDR/barrel`). Opsi: (a) regex rule default + override manual ~10%; (b) biarkan di `nama` dan tambahkan kolom terpisah hanya bila dikurasi. Rekomendasi: (a) dengan flag `status_verifikasi`.
2. **Apakah `nilai_variabel` menyimpan seluruh kolom/tahun** (≈50rb baris, rekomendasi YA) atau hanya input manual + cache hasil formula.
3. **`riwayat`/`data_barang`/`spreadsheet*` lama**: arsip penuh (tidak dipakai model baru) atau dibiarkan. Rekomendasi: biarkan, tidak dihapus.
4. **`formula tapi input manual`** di batch-2 baru 24 baris (dari `[n]Sheet!`); `Data Penunjang` (F3) miliknya 21. Confirm daftar sumber luar (BPS/KLHK/Perhutani/harga) sebagai input API impor.
5. **Tabel agregasi** (`Rekap Hutan Indonesia`, `Hutan Indonesia`, tab "Consistency Check") => simpan sebagai hasil formula (tidak bisa diedit), atau tampilkan read-only.
6. **Urutan migrasi**: (fase 1 impor katalog+nilai) → (fase 2 rule engine untuk F2, lalu F3, F4) → (fase 3 UI form + izin). Konfirmasi prioritas sheet/komoditas uji pertama (rekomendasi: mulai `Penyediaan` F2 dan `Oil` F4).