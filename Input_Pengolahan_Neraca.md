# Halaman Input & Pengolahan Neraca — Dokumentasi Detail

## 1. Ringkasan
Halaman **Input & Pengolahan Neraca** (`InputPengolahanNeraca.jsx`) adalah workspace utama untuk menginput, mengolah, dan memverifikasi data neraca lingkungan (hutan & timber). Tampilan berupa spreadsheet interaktif dengan perhitungan otomatis real-time.

## 2. Keterhubungan dengan Halaman/Modul Lain
- **Penugasan Tabel (Admin)** (`AdminPages.jsx` → `AdminTables`): admin memilih User Entry, memberi akses area spreadsheet, dan membuat tugas Neraca (dataset, tenggat, judul, instruksi). Tugas tersebut muncul di halaman ini sebagai `taskBoard`.
- **Manajemen User & Admin** (`AdminUsers`): akun dengan role `user_entry` dibuat di sini; role menentukan hak akses.
- **Files / Publish** (`FilesPage.jsx`, `ExcelEditor.jsx`): file Excel dipublikasikan ke server agar muncul di Penugasan Tabel dan dapat ditugaskan.
- **Laporan / NeracaOverview**: hasil data yang disimpan di sini menjadi sumber data laporan.
- **Collab Socket** (`collabSocket.js`): presence pengguna online dan sinkronisasi real-time.
- **Dataset Neraca** (API `neraca*`): dataset aktif, rename, delete, select, import, reset.

## 3. Fungsi & Fitur
- Grid spreadsheet dengan kolom tahun (periode) dinamis.
- Sel putih: input manual langsung.
- Tombol "Input Data" per komponen: form entri komprehensif per baris.
- Sel biru (fx): nilai formula otomatis (real-time).
- Simpan perubahan (`Ctrl/Cmd + S`).
- Import Excel (.xlsx) sesuai template; hanya sel input diisi, sisanya dihitung ulang.
- Export/Unduh CSV/Excel.
- Download template Excel.
- Reset angka ke nilai acuan BPS.
- Tambah tahun baru.
- Ganti nama / hapus dataset.
- Drag & drop file .xlsx.
- Presence pengguna online.
- Perhitungan lokal `recalculateLocal` untuk persediaan, pertumbuhan, penanaman, konversi, penebangan, dll.

## 4. Struktur Data (ringkas)
- `data.years`: daftar tahun/periode.
- `data.sheets`: objek per sheet (mis. "Jati Jawa", "Rimba Jawa", "Rimba Luar Jawa").
- Per sheet: `physical`, `rent`, `monetary` dengan nilai per tahun.
- `data.datasets`: daftar dataset; `activeDatasetId` dataset aktif.
- `data.activeDatasetId`: dataset yang sedang ditampilkan.

## 5. Alur Utama

### A. Memuat Halaman
1. Cek autentikasi & hak akses (`canEdit`, `canManage`).
2. Ambil data spreadsheet dari server (`api.neracaSpreadsheet(datasetId)`).
3. Ambil daftar tugas (`api.getNeracaTasks()`).
4. Jika user adalah `user_entry` dengan tugas aktif, tugas otomatis dipilih.
5. Hubungkan collab socket untuk presence.

### B. Input Data
1. User mengubah sel putih atau form "Input Data".
2. `handleCellChange` memperbarui state lokal.
3. `recalculateLocal` menghitung ulang komponen terkait (persediaan awal dari akhir tahun sebelumnya, dst).
4. UI memperbarui sel fx secara real-time.

### C. Simpan
1. `handleManualSave` mengumpulkan `updates`.
2. Kirim ke server (`api.neracaUpdateCell`).
3. Server menyimpan dan mengembalikan data terbaru.
4. State diperbarui.

### D. Import Excel
1. User memilih file .xlsx (drag & drop atau tombol).
2. `handleImportFile` membaca file, kirim base64 ke server (`api.neracaImport`).
3. Server mengisi sel input, menghitung ulang, simpan.
4. Data spreadsheet dimuat ulang.

### E. Export
1. `handleExport` meminta URL CSV dari server (`api.neracaExportCsvUrl`).
2. Unduh file.

### F. Tambah Tahun
1. `handleAddYear` kirim tahun baru (`api.neracaAddYear`).
2. Kolom tahun bertambah di grid.

### G. Reset
1. `handleReset` konfirmasi.
2. `api.neracaReset` mengembalikan nilai acuan BPS.
3. Data dimuat ulang.

### H. Dataset
1. Pilih dataset: `handleSelectDataset`.
2. Rename: `handleRenameDataset`.
3. Delete: `handleDeleteDataset`.

### I. Tugas Neraca (User Entry)
1. User Entry memilih tugas dari `taskBoard`.
2. `handleSelectTask` → `handleStartTask` (mulai mengerjakan, dataset mengikuti tugas).
3. Input data seperti biasa.
4. `handleSubmitTask` menyimpan lalu mengirim hasil (`api.submitNeracaTask`).
5. Admin memverifikasi di Penugasan Tabel (setujui / minta revisi).

### J. Kolaborasi
1. Presence dot & avatar menampilkan user online.
2. Perubahan sinkron via socket.

## 6. Hak Akses
- `canEdit`: boleh mengubah data.
- `canManage`: boleh tambah tahun, import, reset, kelola dataset.
- `user_entry`: hanya area yang diizinkan admin; dataset mengikuti tugas.
- Admin: akses penuh.

## 7. Catatan untuk Perubahan Besar
- Perubahan pada grid/form input harus mempertahankan alur `handleCellChange` → `recalculateLocal` → save.
- Import harus tetap hanya mengisi sel input, bukan formula.
- Task flow bergantung pada `selectedTask` dan `activeDatasetId`.
- Presence & collab socket tidak boleh diputus saat refactor.
- Validasi NIP/akun tidak terkait langsung, tetapi akses User Entry bergantung pada penugasan admin.
