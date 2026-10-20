# Rangkuman Eksekutif Proyek: SISNERLING
**Sistem Informasi Pengolahan Data Neraca Lingkungan Hidup & Kehutanan**
*Platform Terpadu Pengolahan Input-Output, Formulasi Otomatis, dan Kolaborasi Spreadsheet Real-Time*

---

## 1. Latar Belakang & Urgensi Proyek
Sebelum adanya **Sisnerling**, penyusunan Laporan dan Neraca Sumber Daya Alam (khususnya **Neraca Hutan & Neraca Kayu/Timber**, serta **Mineral & Energi**) dilakukan secara desentralisasi menggunakan puluhan berkas lembar kerja Microsoft Excel berukuran besar. 

### Permasalahan yang Dihadapi (Pain Points):
1. **Ketergantungan Rumus Antar-File & Antar-Sheet yang Rapuh:**
   Formula Excel yang merujuk ratusan sel di sheet dan file berbeda kerap kali rusak (*broken link*, `#REF!`, `#VALUE!`) ketika file berpindah direktori atau diubah formatnya.
2. **Ketiadaan Validasi dan Akses Kontrol:**
   Sulit mengontrol siapa yang berhak mengubah formula, siapa yang bertugas menginput angka dasar statistik (BPS, KLHK, Perhutani), dan siapa yang sekadar meninjau (*read-only*).
3. **Konflik Data (*Race Condition*):**
   Penyuntingan bersama secara manual mengakibatkan penumpukan versi file (*v1*, *v2_revisi*, *final_fix*).
4. **Isolasi Logika Bisnis:**
   Rumus-rumus ekonometrika, penilaian sewa ekonomi (rent), deplesi, dan reboisasi tertimbun dalam formula sel dan sulit diaudit.

---

## 2. Tujuan & Solusi Sisnerling
Sisnerling mentransformasikan pengelolaan manual berbasis file Excel menjadi **aplikasi web modern, terpusat, dan kolaboratif**.

- **Web-based Modern Architecture:** Menggantikan software desktop dengan web platform yang responsif dan dapat diakses dari mana saja.
- **Dual-Layer Engine (Generic Long-Format + Web Spreadsheet):**
  - **Lapis Logis (*Logical Layer*):** Membedakan secara tegas antara *Variabel Input Manual* (~976 variabel), *Variabel Formulasi Otomatis* (~1.015 variabel), dan *Formula Input Eksternal* (~24 variabel rujukan luar).
  - **Lapis Visual (*Spreadsheet Faithful*):** Mempertahankan tampilan tabular grid persis seperti spreadsheet yang sudah akrab bagi analis dan auditor.
- **Rule Engine & DAG Dependency:** Evaluasi berantai otomatis menggunakan algoritma *Directed Acyclic Graph* (DAG) dan *Topological Sort* sehingga perubahan satu data langsung mengalir ke perhitungan neraca fisik dan moneter.
- **Real-Time Collaboration & Lock System:** Multi-user editing dengan WebSocket dan mekanisme penguncian rentang/sel (*cell-level locking*) untuk mencegah konflik tumpang tindih input.

---

## 3. Fitur-Fitur Utama Platform

### A. Spreadsheet Interaktif & Kolaborasi Real-Time
- Editor spreadsheet lengkap berbasis browser dengan dukungan formula matematika, evaluasi dinamis, dan pemformatan sel.
- Sinkronisasi kursor, seleksi aktif, dan penanda lock real-time antar pengguna aktif.
- Audit trail dan pencatatan riwayat perubahan (*history revision & audit logging*).

### B. Modul Khusus Neraca Hutan & Timber
- Perhitungan fisik (Volume Kayu, Luas Hutan dlm Hektar) dan moneter (Nilai Rupiah/Sewa Ekonomi).
- Klaster komprehensif: **Jati Jawa, Rimba Jawa, Rimba Luar Jawa**, serta **Rekapitulasi Nasional (Indonesia)**.
- Integrasi data pendukung: Luas kebakaran hutan, realisasi reboisasi, harga acuan, biaya eksploitasi, serta *Gross Operating Surplus* (GOS).

### C. Import & Migrasi Excel Cerdas
- Fitur import file `.xlsx` otomatis yang mampu mengekstraksi struktur sheet, sel formula, gaya visual, dan memetakan variabel ke skema database secara langsung.
- Pengecekan status sel: Input Manual (IM), Hasil Formulasi (HF), Formula Input Manual (FIM), hingga pendeteksian sel error.

### D. Manajemen Peran & Hak Akses Berjenjang (RBAC)
- **Super Admin:** Akses penuh konfigurasi sistem, kelola pengguna, penugasan izin tabel/sheet, backup/restore database, serta mode pemeliharaan (*maintenance*).
- **Admin:** Memiliki hak input dan edit data terbatas hanya pada tabel atau modul yang secara resmi ditugaskan oleh Super Admin.
- **User (Auditor/Pimpinan):** Akses melihat seluruh data, dashboard pemantauan, visualisasi tren, dan cetak laporan resmi tanpa izin mengubah angka.

### E. Dashboard Analisis & Visualisasi Tren
- Grafik interaktif untuk melihat tren neraca sumber daya alam tahunan dan bulanan.
- Indikator ringkas pergerakan stok awal, penambahan (pertumbuhan/reboisasi), pengurangan (penebangan/deplesi/kebakaran), dan saldo akhir.

---

## 4. Arsitektur Teknologi (Tech Stack)

| Lapisan | Teknologi | Peran & Keunggulan |
|---|---|---|
| **Frontend** | React, Vite, Vanilla CSS Modern | Antarmuka interaktif, rendering tabel berkecepatan tinggi, tanpa bloatware CSS |
| **Backend** | Node.js, Express.js | REST API modular, arsitektur event-driven, penanganan perhitungan matematika cepat |
| **Realtime** | WebSocket (Collab Engine) | Siaran perubahan sel dan status kursor secara instan tanpa delay (*low-latency*) |
| **Database** | MySQL / MariaDB (InnoDB) | Penyimpanan relasional kuat, integritas data transaksional, indexing deret waktu |
| **Penyimpanan Data** | Long-Format Schema + JSON Rule DAG | Normalisasi data deret waktu tahunan dan penyimpanan logika rumus secara deklaratif |

---

## 5. Ringkasan Kamus Variabel & Dimensi Data
Berdasarkan inventarisasi dan kurasi data teknis (contoh modul Neraca Hutan & Timber):
- **Cakupan File:** *1. LK Neraca Fisik & Moneter Hutan.xlsx* (19 sheet) & *2. LK Timber.xlsx* (24 sheet).
- **Total Variabel Terdata:** ±1.992+ variabel unik terklasifikasi.
- **Rasio Otomatisasi:**
  - **~51% Hasil Formulasi (HF):** Sepenuhnya dihitung otomatis oleh rule engine tanpa butuh intervensi ketik manual.
  - **~48% Input Manual (IM):** Terstandarisasi melalui form input terarah dan tervalidasi.
  - **~1% Formula Input Manual (FIM):** Mengakomodasi parameter eksternal makro (harga acuan dunia, survei BPS/KLHK).

---

## 6. Manfaat & Dampak Positif
1. **Efisiensi Waktu Pengolahan:** Mengurangi waktu siklus penyusunan neraca dari hitungan minggu menjadi hitungan menit setelah data dasar diisi.
2. **Eliminasi Human-Error:** Rumus sentral terstandarisasi memastikan konsistensi metodologi tanpa risiko rumusan sel terhapus tidak sengaja.
3. **Akuntabilitas & Keamanan:** Setiap perubahan tercatat siapa pengubahnya, kapan dilakukan, dan nilai sebelumnya dapat ditelusuri secara presisi.
4. **Kesiapan Integrasi:** Skema generic long-format memudahkan sistem terhubung dengan API nasional atau sistem informasi lingkungan hidup lainnya di masa depan.
