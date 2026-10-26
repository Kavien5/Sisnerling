# Pengembangan Audit Log, Auto-Backup, dan Restore Data SISNERLING

## 1. Tujuan Pengembangan

Kembangkan halaman **Audit Log** pada SISNERLING menjadi sistem audit, pencadangan riwayat perubahan, dan pemulihan data yang memungkinkan Super Admin mengembalikan data ke kondisi sebelumnya apabila terjadi kesalahan pengeditan, penghapusan, atau pengolahan spreadsheet.

Sistem harus bekerja seperti fitur **Undo/Redo (Ctrl+Z dan Ctrl+Y)**, tetapi dapat digunakan untuk memulihkan perubahan yang sudah tersimpan di database, termasuk perubahan yang dilakukan pengguna lain.

Fokus utama adalah menjaga keamanan data statistik dan neraca agar kesalahan pengguna tidak menyebabkan kehilangan data permanen.

## 2. Kebijakan Retensi Audit Log

### 2.1. Masa Penyimpanan Tiga Hari

- Audit Log yang ditampilkan sebagai riwayat aktif memiliki masa penyimpanan selama 3 hari atau 72 jam sejak aktivitas tercatat.
- Sistem harus memberikan peringatan sebelum log mencapai batas waktu penghapusan.
- Penghapusan log yang sudah melewati masa retensi dilakukan secara otomatis oleh backend melalui scheduled job atau mekanisme penjadwalan yang sesuai.
- Proses penghapusan harus mempertimbangkan apakah suatu log masih diperlukan untuk proses pemulihan data.
- Jangan menghapus riwayat yang masih menjadi satu-satunya sumber untuk memulihkan data.

### 2.2. Notifikasi Peringatan

Tambahkan notifikasi peringatan pada halaman Audit Log.

Ketentuan:
- Tampilkan jumlah log yang akan segera kedaluwarsa.
- Berikan peringatan ketika log mendekati batas 72 jam, misalnya pada 24 jam terakhir.
- Tampilkan waktu kedaluwarsa setiap log secara jelas.
- Sediakan tombol **Simpan Riwayat** untuk menyimpan riwayat penting agar tetap tersedia setelah melewati masa retensi.
- Berikan konfirmasi sebelum pengguna menyimpan atau mengarsipkan riwayat.

Contoh notifikasi:

> Peringatan: Terdapat 15 riwayat aktivitas yang akan kedaluwarsa dalam 24 jam. Simpan riwayat penting untuk mempertahankan akses ke catatan tersebut.

### 2.3. Penyimpanan dan Pengarsipan

Buat mekanisme penyimpanan riwayat secara terpisah dari audit log aktif.

Ketentuan:
- Riwayat yang disimpan tidak ikut terhapus oleh proses pembersihan otomatis.
- Super Admin dapat melihat, mencari, memfilter, dan mengunduh riwayat yang diarsipkan.
- Sediakan tindakan untuk mengarsipkan satu log maupun beberapa log sekaligus.
- Sediakan fitur pengembalian arsip ke tampilan riwayat aktif jika diperlukan.
- Arsip harus tetap mengikuti aturan keamanan dan hak akses sistem.
- Arsipkan hanya metadata dan data yang diperlukan, dengan mempertimbangkan kapasitas penyimpanan database.

**Penting:** Audit Log dan data pemulihan harus dipisahkan secara logis. Menghapus tampilan log tidak boleh otomatis menghapus cadangan data yang diperlukan untuk restore.

## 3. Fitur Restore Data (Undo/Redo)

### 3.1. Tujuan

Tambahkan fitur untuk mengembalikan data ke kondisi sebelum perubahan dilakukan.

Contoh kasus:

1. User mengedit 50 baris data statistik secara tidak sengaja.
2. Perubahan tersimpan di database.
3. Sistem merekam data sebelum dan sesudah pengeditan.
4. Super Admin membuka Audit Log dan memilih aktivitas tersebut.
5. Super Admin menekan tombol **Restore**.
6. Sistem menampilkan pratinjau perubahan yang akan dibatalkan.
7. Setelah dikonfirmasi, sistem mengembalikan data ke kondisi sebelumnya.

Fitur ini tidak boleh terbatas pada perubahan yang belum disimpan. Data yang sudah tersimpan harus dapat dipulihkan selama riwayat pemulihannya masih tersedia.

### 3.2. Modul yang Harus Mendukung Restore

Implementasikan fitur restore secara bertahap pada seluruh modul pengolahan data SISNERLING, khususnya:

1. Spreadsheet Statistik.
2. Input dan Pengolahan Neraca Fisik.
3. Input dan Pengolahan Neraca Moneter.
4. Modul data statistik dan neraca lainnya yang menggunakan mekanisme penyimpanan data.
5. Import Excel atau spreadsheet.
6. Penghapusan baris, kolom, tabel, atau data yang didukung aplikasi.
7. Perubahan data yang dilakukan melalui fitur pengeditan massal.

Pastikan implementasi menyesuaikan struktur database dan mekanisme penyimpanan aktual masing-masing modul.

### 3.3. Data yang Harus Dicatat

Untuk setiap perubahan yang dapat dipulihkan, simpan informasi berikut:

- ID audit log.
- ID pengguna yang melakukan perubahan.
- Waktu perubahan.
- Modul dan jenis data yang diubah.
- ID tabel, spreadsheet, lembar kerja, atau record yang terdampak.
- Jenis tindakan: create, update, delete, import, atau tindakan lain yang relevan.
- Data sebelum perubahan (`old_data`).
- Data sesudah perubahan (`new_data`).
- ID transaksi atau kelompok perubahan.
- Status pemulihan.
- Informasi versi data untuk mencegah pemulihan yang menimpa perubahan terbaru.

Untuk perubahan massal, seluruh data yang terdampak harus tercatat dengan cukup lengkap untuk dipulihkan secara konsisten.

## 4. Desain Antarmuka Restore

Tambahkan tombol atau tindakan berikut pada halaman Audit Log:

- **Detail**: Melihat rincian aktivitas dan perbandingan data sebelum dan sesudah.
- **Restore**: Memulihkan data ke kondisi sebelum aktivitas tertentu.
- **Simpan Riwayat**: Mengarsipkan log dan mempertahankan akses terhadap riwayatnya.
- **Restore Batch**: Memulihkan satu kelompok perubahan, misalnya satu proses import Excel.
- **Lihat Riwayat Versi**: Melihat daftar perubahan sebelumnya untuk data yang sama.

### 4.1. Pratinjau Sebelum Restore

Sebelum pemulihan dijalankan, tampilkan modal konfirmasi yang memuat:

- Nama pengguna yang melakukan perubahan.
- Tanggal dan waktu aktivitas.
- Nama modul dan objek yang terdampak.
- Jumlah record yang akan dipulihkan.
- Nilai saat ini.
- Nilai yang akan dikembalikan.
- Dampak pemulihan terhadap data yang sedang tersimpan.

Tombol yang tersedia:

- Batal.
- Konfirmasi Restore.

Jangan langsung memulihkan data hanya karena tombol Restore diklik.

### 4.2. Perbandingan Data

Gunakan tampilan perbandingan tiga kolom:

| Field | Nilai Saat Ini | Nilai Setelah Restore |
|---|---|---|
| Nama indikator | Indikator B | Indikator A |
| Tahun | 2026 | 2025 |
| Nilai | 250 | 200 |

Field yang berubah harus diberi penanda visual.

Untuk perubahan massal, tampilkan jumlah record yang terdampak serta detail perubahan yang dapat diperiksa sebelum konfirmasi.

## 5. Arsitektur Penyimpanan Riwayat

Pisahkan tanggung jawab penyimpanan menjadi tiga bagian:

### 5.1. Audit Log

Mencatat siapa melakukan tindakan apa, kapan, dan melalui modul mana.

Audit Log digunakan untuk investigasi, pelacakan aktivitas, dan pemantauan keamanan.

### 5.2. Riwayat Pemulihan atau Version History

Menyimpan snapshot atau informasi perubahan yang dibutuhkan untuk mengembalikan data ke versi sebelumnya.

Ketentuan:

- Riwayat harus tetap tersedia meskipun audit log aktif sudah kedaluwarsa.
- Riwayat tidak boleh dihapus sebelum masa retensi pemulihan berakhir atau sebelum kebijakan pengarsipan mengizinkannya.
- Penyimpanan harus mendukung pemulihan perubahan satu record maupun perubahan massal.
- Pastikan skema penyimpanan sesuai dengan struktur data spreadsheet yang sebenarnya.

### 5.3. Arsip Audit

Menyimpan log yang secara eksplisit dipertahankan oleh Super Admin.

Arsip audit dapat memuat metadata aktivitas dan referensi ke versi data terkait, tanpa harus menduplikasi seluruh snapshot apabila tidak diperlukan.

**Jangan mengandalkan tabel `audit_logs` saja sebagai satu-satunya sumber pemulihan.** Penghapusan log tidak boleh membuat fitur restore kehilangan data historis.

## 6. Mekanisme Keamanan Restore

Restore merupakan tindakan yang mengubah data produksi sehingga harus memiliki perlindungan khusus.

### 6.1. Hak Akses

- Hanya akun dengan role `super_admin` yang boleh menjalankan restore.
- Backend wajib memverifikasi hak akses pada setiap endpoint restore.
- Menyembunyikan tombol di frontend tidak cukup untuk mengamankan endpoint.
- Semua permintaan restore harus memeriksa autentikasi dan otorisasi.

### 6.2. Transaksi Database

- Gunakan transaksi database untuk pemulihan data yang saling berkaitan.
- Jika salah satu bagian pemulihan gagal, batalkan seluruh transaksi yang terkait.
- Hindari kondisi ketika sebagian data sudah dipulihkan tetapi bagian lainnya belum.
- Pastikan proses import massal dan pemulihan batch tetap konsisten.

### 6.3. Pencegahan Konflik Data

Sebelum menjalankan restore, periksa apakah data sudah berubah sejak aktivitas yang akan dibatalkan.

Contoh:

1. User A mengubah nilai dari 100 menjadi 200.
2. User B mengubah nilai dari 200 menjadi 300.
3. Super Admin mencoba membatalkan perubahan User A.

Sistem tidak boleh langsung mengganti nilai 300 menjadi 100 tanpa memeriksa perubahan setelahnya.

Tampilkan peringatan konflik dan minta Super Admin meninjau kondisi terbaru sebelum melanjutkan.

Gunakan mekanisme versioning, optimistic locking, atau pemeriksaan nilai yang sesuai dengan arsitektur aplikasi.

### 6.4. Restore Harus Menghasilkan Audit Log Baru

Setiap tindakan restore harus dicatat sebagai aktivitas baru, misalnya:

- `action`: `restore`
- `module`: modul yang dipulihkan.
- `description`: alasan dan ringkasan pemulihan.
- `user_id`: pengguna yang menjalankan restore.
- `created_at`: waktu pemulihan.
- `old_data`: kondisi tepat sebelum restore.
- `new_data`: kondisi setelah restore.
- `source_log_id`: ID aktivitas sumber yang dipulihkan, jika tersedia.

Dengan demikian, tindakan restore itu sendiri dapat ditelusuri dan tidak menghilangkan jejak audit sebelumnya.

## 7. Undo dan Redo

Selain restore dari Audit Log, rancang dukungan Undo/Redo untuk pengalaman pengeditan spreadsheet.

### Undo

- Membatalkan perubahan terakhir yang didukung.
- Dapat digunakan untuk satu sel, beberapa sel, perubahan tabel, dan import massal jika didukung.
- Untuk tindakan yang sudah tersimpan, Undo harus menggunakan mekanisme backend yang aman, bukan hanya mengubah tampilan frontend.

### Redo

- Mengulangi perubahan yang sebelumnya dibatalkan.
- Hanya tersedia jika kondisi data belum mengalami konflik yang membuat pengulangan tidak aman.
- Setiap tindakan Redo juga harus tercatat di Audit Log.

### Batasan

Jangan menganggap semua operasi bisa dibatalkan dengan cara yang sama.

- Perubahan nilai sel dapat dipulihkan dari nilai sebelumnya.
- Penghapusan record memerlukan data lengkap sebelum penghapusan.
- Import massal memerlukan snapshot atau catatan perubahan seluruh record yang terdampak.
- Pembuatan record harus dapat dibatalkan tanpa menghapus record lain yang dibuat setelahnya.
- Perubahan struktur tabel memerlukan mekanisme khusus apabila didukung aplikasi.

Jika implementasi Undo/Redo penuh membutuhkan arsitektur tambahan, prioritaskan restore yang andal melalui Audit Log terlebih dahulu.

## 8. Backend dan API

Periksa implementasi yang sudah tersedia sebelum mengubah kode:

- `client/src/pages/AuditLogs.jsx`
- `server/audit.js`
- `server/auditLog.js`

Identifikasi juga endpoint penyimpanan spreadsheet, input neraca, import Excel, dan penghapusan data.

Rancang endpoint sesuai pola API yang sudah digunakan oleh SISNERLING. Contoh operasi yang dibutuhkan:

- Mengambil log yang akan kedaluwarsa.
- Mengarsipkan log.
- Mengambil arsip audit.
- Mengambil riwayat versi suatu data.
- Meminta pratinjau restore.
- Menjalankan restore setelah konfirmasi.
- Menjalankan Undo/Redo apabila sudah didukung.

Nama endpoint di atas merupakan kebutuhan fungsional, bukan keharusan menggunakan URL tertentu. Sesuaikan implementasi dengan struktur routing yang ada.

Semua operasi yang mengubah data wajib dilakukan melalui backend.

## 9. Penjadwalan dan Pembersihan Otomatis

Implementasikan proses terjadwal untuk:

1. Memeriksa log yang mendekati kedaluwarsa.
2. Menyediakan informasi kedaluwarsa untuk notifikasi.
3. Menghapus log aktif yang sudah melewati batas 72 jam dan tidak lagi diperlukan oleh kebijakan retensi.
4. Mempertahankan arsip dan riwayat pemulihan yang masih berlaku.
5. Mencatat hasil proses pembersihan serta kesalahan yang terjadi.

Proses ini harus berjalan secara otomatis tanpa membutuhkan halaman Audit Log terbuka.

Hindari mengandalkan `setTimeout` pada frontend atau proses yang hanya berjalan selama server menerima permintaan pengguna. Gunakan scheduler backend yang sesuai dengan lingkungan deployment.

## 10. Ketentuan Database dan Migrasi

- Periksa skema database yang sudah ada sebelum membuat tabel atau kolom baru.
- Pertahankan kompatibilitas dengan data lama.
- Buat migrasi database yang aman dan dapat dijalankan ulang sesuai pola project.
- Jangan menghapus atau mengganti tabel lama secara destruktif.
- Tambahkan indeks untuk pencarian riwayat berdasarkan waktu, pengguna, modul, dan objek data jika diperlukan.
- Pertimbangkan ukuran snapshot agar penyimpanan tidak membengkak akibat import Excel berukuran besar.
- Jangan menyimpan kata sandi, token autentikasi, atau rahasia lain dalam snapshot audit.

## 11. Pengujian Wajib

Uji skenario berikut sebelum fitur dianggap selesai:

1. User mengedit satu sel spreadsheet, kemudian Super Admin berhasil memulihkannya.
2. User mengedit banyak sel sekaligus, kemudian seluruh perubahan dapat dipulihkan.
3. User menghapus beberapa record, kemudian data kembali secara utuh.
4. User mengimpor file Excel, kemudian hasil import dapat dibatalkan sesuai batasan yang ditetapkan.
5. Super Admin mengarsipkan log, lalu log tetap tersedia setelah 72 jam.
6. Log aktif yang sudah kedaluwarsa dibersihkan secara otomatis.
7. Snapshot pemulihan tetap tersedia setelah log aktif dihapus.
8. Pengguna biasa dan admin biasa tidak dapat menjalankan restore melalui API.
9. Restore gagal di tengah transaksi, dan database tidak tertinggal dalam kondisi setengah dipulihkan.
10. Restore menghadapi perubahan yang lebih baru, dan sistem mendeteksi konflik.
11. Undo diikuti Redo menghasilkan kondisi data yang benar.
12. Setiap restore, Undo, dan Redo menghasilkan audit log baru.
13. Filter, paginasi, modal detail, dan perbandingan data yang sudah ada tetap berfungsi.
14. Penghapusan akun tidak menghilangkan informasi historis pelaku dari log.
15. Proses pembersihan tidak menghapus arsip atau versi data yang masih diperlukan.

## 12. Tahapan Implementasi

Lakukan pengembangan secara bertahap.

### Tahap 1 — Audit dan Analisis Kode

- Pelajari struktur frontend, backend, database, dan autentikasi.
- Identifikasi seluruh jalur penulisan data yang perlu mendukung restore.
- Tentukan format snapshot atau version history yang sesuai.
- Jangan mengubah kode sebelum memahami alur penyimpanan data.

### Tahap 2 — Retensi dan Arsip

- Tambahkan status kedaluwarsa.
- Tambahkan notifikasi.
- Implementasikan pengarsipan.
- Implementasikan pembersihan otomatis yang aman.

### Tahap 3 — Restore Data

- Implementasikan pencatatan perubahan sebelum dan sesudah.
- Tambahkan pratinjau restore.
- Implementasikan restore satu record.
- Lanjutkan ke perubahan massal, spreadsheet, dan import Excel.
- Tambahkan pemeriksaan konflik dan transaksi database.

### Tahap 4 — Undo/Redo

- Implementasikan Undo/Redo untuk operasi yang telah memiliki riwayat pemulihan yang andal.
- Integrasikan dengan frontend spreadsheet.
- Pastikan tindakan yang sudah tersimpan dapat dibatalkan melalui backend.

### Tahap 5 — Pengujian dan Validasi

- Jalankan seluruh pengujian wajib.
- Verifikasi hak akses.
- Verifikasi konsistensi data.
- Dokumentasikan fitur yang sudah selesai dan keterbatasan yang masih ada.

## 13. Ketentuan Implementasi untuk AI Coding Agent

Saat mengimplementasikan fitur ini:

1. Gunakan teknologi dan pola arsitektur yang sudah digunakan oleh SISNERLING.
2. Periksa kode aktual terlebih dahulu; jangan berasumsi bahwa `old_data` dan `new_data` sudah lengkap atau bahwa seluruh modul sudah terintegrasi dengan Audit Log.
3. Jangan membuat simulasi restore yang hanya mengubah frontend tanpa memperbarui database.
4. Jangan menghapus data historis yang diperlukan untuk pemulihan.
5. Jangan melakukan perubahan destruktif pada database produksi.
6. Jangan merusak fitur import, export, spreadsheet, pengolahan neraca, autentikasi, dan hak akses yang sudah ada.
7. Implementasikan fitur secara bertahap dan verifikasi setiap tahap sebelum melanjutkan.
8. Jika suatu modul belum mendukung restore dengan aman, identifikasi kekurangannya dan selesaikan mekanisme pencatatan perubahan terlebih dahulu.
9. Berikan laporan akhir mengenai file yang diubah, migrasi database, endpoint baru, cara kerja retensi, modul yang sudah mendukung restore, dan hasil pengujian.

## 14. Kriteria Keberhasilan

Fitur dianggap selesai apabila:

- Audit Log aktif kedaluwarsa secara otomatis setelah 72 jam sesuai kebijakan.
- Pengguna menerima peringatan sebelum log kedaluwarsa.
- Riwayat penting dapat disimpan dan tetap diakses.
- Super Admin dapat memulihkan data yang sudah tersimpan ke kondisi sebelumnya.
- Spreadsheet Statistik, input dan pengolahan Neraca Fisik, Neraca Moneter, serta import Excel dapat dipulihkan sesuai cakupan implementasi.
- Pemulihan data tidak menimpa perubahan terbaru tanpa pemeriksaan konflik.
- Seluruh tindakan pemulihan tercatat dalam Audit Log.
- Hak akses, integritas database, dan fitur yang sudah ada tetap terjaga.

**Prioritas tertinggi: integritas data dan kemampuan restore.** Penghapusan audit log setelah tiga hari tidak boleh menghilangkan kemampuan memulihkan data yang masih dibutuhkan. Terapkan retensi audit log dan retensi riwayat pemulihan sebagai dua kebijakan terpisah.
