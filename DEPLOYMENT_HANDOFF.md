# Handoff Persiapan Hosting SISNERLING

Dokumen ini merangkum kebutuhan teknis dan hal yang perlu disepakati sebelum SISNERLING dipasang di hosting kantor. Belum ada kredensial atau konfigurasi khusus provider di dalam dokumen ini.

## Ringkasan aplikasi

- Frontend React/Vite dan backend Node.js/Express disajikan dari satu aplikasi Node.js.
- Backend membutuhkan MySQL; backend juga menyediakan API dan koneksi realtime Socket.IO.
- Build frontend disalin ke `server/public` oleh `npm run build`.
- Source code dan file pendukung harus dikirim melalui repositori atau paket rilis internal. Jangan mengirim folder `node_modules`, file `.env`, log, atau kredensial.

## Kebutuhan hosting yang disarankan

- Hosting/VPS yang mengizinkan proses Node.js berjalan terus-menerus (bukan hosting statis saja).
- Node.js LTS 20 atau lebih baru dan npm.
- MySQL 8 atau lebih baru, dengan database terpisah untuk aplikasi dan backup terjadwal.
- Domain/subdomain kantor dengan HTTPS; reverse proxy harus meneruskan HTTP dan WebSocket ke proses Node.js.
- Penyimpanan persisten dan backup untuk database serta `server/data` dan `server/storage`.
- Proses Node.js dikelola service manager hosting (misalnya PM2 atau systemd di VPS) agar otomatis hidup kembali.

## Konfigurasi yang perlu disiapkan oleh admin hosting

Nilai di bawah ini dimasukkan sebagai environment variables/hosting secrets, bukan ke Git:

| Variabel | Keterangan |
| --- | --- |
| `PORT` | Port internal yang ditentukan hosting; aplikasi memakai `3000` jika tidak diberikan. |
| `DB_HOST`, `DB_PORT` | Host dan port MySQL yang dapat dijangkau dari server aplikasi. |
| `DB_NAME` | Nama database SISNERLING. |
| `DB_USER`, `DB_PASSWORD` | Akun aplikasi khusus; jangan gunakan akun `root` di produksi. |
| `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD` | Opsional untuk membuat admin awal ketika belum ada akun admin. Gunakan password acak yang kuat; jangan kirim lewat email/chat biasa. |
| `SEED_SUPER_ADMIN_NAMA` | Nama admin awal; opsional, default `Admin`. |

File contoh tersedia di [`server/.env.example`](./server/.env.example). Pada startup, aplikasi menjalankan inisialisasi skema dan migrasi database. Akun database perlu izin membuat database pada instalasi pertama serta membuat/mengubah tabel; koordinasikan izin ini dengan DBA. Setelah skema siap, hak akses sebaiknya ditinjau dan dibatasi sesuai prosedur kantor.

## Langkah build dan menjalankan aplikasi

Jalankan dari direktori utama repositori:

```sh
npm ci --prefix server
npm ci --prefix client
npm run build
npm start
```

Server melayani halaman dan API pada port `PORT` (default `3000`). Setelah domain/reverse proxy aktif, periksa `https://<domain>/api/health`, login, fungsi spreadsheet, ekspor file, dan koneksi realtime. Build lokal terverifikasi berhasil; Vite masih memberi peringatan bahwa bundle JavaScript utama lebih dari 500 kB, tetapi build selesai.

### Halaman Input & Pengolahan Neraca

Halaman ini **sudah ada di checkout laptop ini dan di branch GitHub `main`**, dengan isi yang sama. File sumber dan stylesheet-nya:

- [`client/src/pages/InputPengolahanNeraca.jsx`](./client/src/pages/InputPengolahanNeraca.jsx)
- [`client/src/pages/InputPengolahanNeraca.css`](./client/src/pages/InputPengolahanNeraca.css)

Halaman sudah diimpor dan ditampilkan oleh [`client/src/App.jsx`](./client/src/App.jsx), serta memakai endpoint neraca pada backend. Menjalankan `npm run build` dari root akan memasukkannya ke bundle frontend yang disalin ke `server/public`; file JSX tidak perlu disalin terpisah ke hosting.

Jika halaman tidak muncul di device lain, pastikan device tersebut mengambil branch `main` yang terbaru dan membangun ulang aplikasinya, bukan mengirim folder hasil build lama saja:

```sh
git pull origin main
npm ci --prefix server
npm ci --prefix client
npm run build
```

Kirim/deploy source repository beserta hasil build terbaru. Jangan menimpa source dengan salinan lama atau hanya mengunggah bundle `server/public` yang sudah ada sebelumnya.

## Blocker dan keputusan sebelum go-live

1. **Jangan buka ke pengguna produksi sebelum isu penyimpanan password diperbaiki.** Saat ini backend menyimpan password pengguna sebagai teks biasa di `password_plain` dan endpoint manajemen admin membacanya. Ini perlu dihapus dari alur aplikasi/database dan ditinjau keamanannya sebelum data/akun riil dipakai.
2. Registrasi publik secara default diizinkan kecuali pengaturan aplikasi menonaktifkannya. Tentukan kebijakan pembuatan akun dan batasi registrasi sebelum domain dibuka.
3. CORS backend saat ini mengizinkan origin secara luas. Batasi ke origin domain resmi sebelum layanan dipublikasikan.
4. File `.htaccess` di root saat ini melakukan redirect ke `127.0.0.1:3000`; jangan pasang begitu saja. Host harus memakai konfigurasi reverse proxy yang benar dan HTTPS. Pastikan juga dukungan WebSocket untuk Socket.IO.
5. Tetapkan pemilik operasional: siapa yang mengelola domain/SSL, database, backup & pemulihan, pemantauan log, pembaruan aplikasi, serta akses admin.

## Pertanyaan untuk admin hosting/atasan

- Apa provider dan jenis paket hostingnya? Apakah mendukung Node.js yang berjalan terus-menerus, reverse proxy, dan WebSocket?
- Apa domain/subdomain, metode deploy, dan kebijakan akses jaringan yang akan dipakai?
- Siapa yang menyediakan database, kredensial lewat secret manager, dan backup?
- Apakah layanan untuk uji internal terbatas atau langsung digunakan sebagai sistem produksi?

**Status:** siap untuk pembahasan kebutuhan hosting dan uji build; belum layak dinyatakan siap go-live sampai blocker keamanan dan konfigurasi hosting di atas ditangani.
