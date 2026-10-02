import React from "react";
import { isSuperAdmin, roleLabel } from "../auth.js";

const SECTIONS = [
  { id: "tentang", label: "1. Tentang Sistem & Peran Pengguna" },
  { id: "masuk", label: "2. Masuk / Keluar Akun" },
  { id: "dashboard", label: "3. Dashboard" },
  { id: "spreadsheet", label: "4. Spreadsheet (Editor Data)" },
  { id: "file-terimport", label: "5. File Terimport" },
  { id: "import-excel", label: "6. Import Excel (Super Admin)" },
  { id: "hasil-import", label: "7. Hasil Import & Visualisasi" },
  { id: "kategori", label: "8. Kategori" },
  { id: "laporan", label: "9. Laporan" },
  { id: "admin-user", label: "10. Kelola Akun & Role (Super Admin)" },
  { id: "admin-tugas", label: "11. Penugasan Tabel ke Admin" },
  { id: "admin-maintenance", label: "12. Maintenance Mode" },
  { id: "admin-backup", label: "13. Backup & Restore" },
  { id: "admin-pengaturan", label: "14. Pengaturan Umum" },
  { id: "tips", label: "15. Tips & Catatan Penting" },
];

function Step({ n, children }) {
  return (
    <li className="pd-step">
      <span className="pd-step-num">{n}</span>
      <span className="pd-step-body">{children}</span>
    </li>
  );
}

export default function Panduan({ user }) {
  const [active, setActive] = React.useState("tentang");

  const scrollTo = (id) => {
    setActive(id);
    const el = document.getElementById("pd-" + id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const roleTag = (r) => (
    <span className="pd-role-tag" data-role={r}>{roleLabel(r)}</span>
  );

  return (
    <div className="pd-page">
      <div className="page-title">
        <h2>Panduan Penggunaan Website</h2>
        <p>Langkah-langkah lengkap menggunakan setiap fitur Sisnerling</p>
      </div>

      <div className="pd-layout">
        {/* ===== SIDEBAR DAFTAR ISI ===== */}
        <div className="pd-toc-wrap">
          <div className="card pd-toc">
            <div className="card-header"><h2>Daftar Isi</h2></div>
            <div className="card-body">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={`pd-toc-item${active === s.id ? " active" : ""}`}
                  onClick={() => scrollTo(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ===== ISI PANDUAN ===== */}
        <div className="pd-content">
          {/* 1. TENTANG */}
          <div id="pd-tentang" className="card pd-section">
            <div className="card-header"><h2>Tentang Sistem & Peran Pengguna</h2></div>
            <div className="card-body">
              <p>
                <b>Sisnerling</b> adalah sistem pengolahan data input–output berbasis spreadsheet yang terpusat.
                Data berupa berkas Excel (file .xlsx/.xls) dapat diimport, dilihat, diedit, dikelompokkan ke dalam
                kategori, lalu dipantau melalui dashboard dan laporan.
              </p>
              <p>Aplikasi memiliki <b>tiga peran pengguna</b> dengan hak akses yang berbeda:</p>
              <div className="pd-role-grid">
                <div className="pd-role-card" data-role="user">
                  <div><b>User</b></div>
                  <ul>
                    <li>Melihat seluruh data, dashboard, kategori, laporan.</li>
                    <li>Membuka file terimport (mode hanya-lihat).</li>
                    <li>Tidak dapat mengubah atau mengisi data.</li>
                  </ul>
                </div>
                <div className="pd-role-card" data-role="admin">
                  <div><b>Admin</b></div>
                  <ul>
                    <li>Semua yang bisa dilakukan User.</li>
                    <li>Entry &amp; edit data, tetapi <b>hanya pada tabel yang ditugaskan</b> kepadanya oleh Super Admin.</li>
                    <li>Tidak bisa mengelola akun, backup, atau maintenance.</li>
                  </ul>
                </div>
                <div className="pd-role-card" data-role="super_admin">
                  <div><b>Super Admin</b></div>
                  <ul>
                    <li>Semua fitur dapat digunakan tanpa batasan.</li>
                    <li>Import Excel, kelola akun &amp; role, penugasan tabel, maintenance, backup/restore, pengaturan.</li>
                    <li>Anda saat ini: {roleLabel(user?.role)}.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 2. MASUK */}
          <div id="pd-masuk" className="card pd-section">
            <div className="card-header"><h2>Masuk / Keluar Akun</h2></div>
            <div className="card-body">
              <h4>Masuk (Login)</h4>
              <ol className="pd-ol">
                <Step n="1">Buka halaman utama aplikasi. Jika belum login, Anda akan diarahkan ke form <b>Masuk</b>.</Step>
                <Step n="2">Isi <b>Email</b> dan <b>Password</b> yang sudah didaftarkan.</Step>
                <Step n="3">Klik tombol <b>Masuk</b>. Anda akan dibawa ke Dashboard.</Step>
              </ol>
              <h4>Daftar Akun Baru (jika dibuka)</h4>
              <ol className="pd-ol">
                <Step n="1">Pada halaman Masuk, klik <b>Daftar</b> (Registrasi).</Step>
                <Step n="2">Isi Nama, Email, Password, dan Konfirmasi Password.</Step>
                <Step n="3">Klik <b>Daftar</b>. Akun baru otomatis berperan <b>User</b>.</Step>
              </ol>
              <p className="pd-note">
                Registrasi terbuka bisa dimatikan oleh Super Admin lewat menu <b>Pengaturan</b>. Bila dinonaktifkan,
                semua akun dibuat oleh Super Admin melalui panel <b>User &amp; Admin Management</b>.
              </p>
              <h4>Keluar / Ubah Akun</h4>
              <ol className="pd-ol">
                <Step n="1">Klik profil Anda di pojok kanan atas (atau di bagian bawah menu samping).</Step>
                <Step n="2">Pilih <b>Keluar</b> untuk kembali ke halaman Masuk.</Step>
              </ol>
            </div>
          </div>

          {/* 3. DASHBOARD */}
          <div id="pd-dashboard" className="card pd-section">
            <div className="card-header"><h2>Dashboard</h2></div>
            <div className="card-body">
              <p>Dashboard menampilkan ringkasan dan statistik seluruh data yang ada di spreadsheet:</p>
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Dashboard</b> di samping kiri.</Step>
                <Step n="2">Lihat <b>grafik ringkasan</b> untuk setiap sheet/file dan jumlah nilainya.</Step>
                <Step n="3">Pada bagian <b>Perbandingan Data</b>, Anda dapat membandingkan data antar sheet maupun antar periode secara cepat.</Step>
              </ol>
              <p className="pd-note">Statistik diperbarui otomatis dari data yang tersimpan di Spreadsheet — tidak perlu tombol muat ulang.</p>
            </div>
          </div>

          {/* 4. SPREADSHEET */}
          <div id="pd-spreadsheet" className="card pd-section">
            <div className="card-header"><h2>Spreadsheet (Editor Data)</h2></div>
            <div className="card-body">
              <p>
                Halaman ini adalah editor tabel tempat Anda melihat dan mengisi data. Bagi <b>User</b> mode hanya-lihat
                (semua tombol edit disembunyikan/dinonaktifkan). <b>Admin</b> &amp; <b>Super Admin</b> dapat menulis
                data, tetapi Admin hanya pada tabel yang ditugaskan kepadanya.
              </p>
              <h4>Membuat File Baru (Admin/Super Admin)</h4>
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Spreadsheet</b>.</Step>
                <Step n="2">Klik menu <b>File</b> &rarr; <b>File Baru</b>. File kosong (Sheet1) dibuat.</Step>
                <Step n="3">Isi data tiap sel dengan mengetik langsung. Gunakan <b>Enter</b> untuk turun, <b>Tab</b> untuk pindah kolom.</Step>
              </ol>
              <h4>Membuka / Berpindah File</h4>
              <ol className="pd-ol">
                <Step n="1">Gunakan menu <b>File</b> di toolbar untuk memilih file yang ingin dibuka.</Step>
                <Step n="2">Atau buka dari halaman <b>File Terimport</b> dengan menekan tombol <b>Buka</b> pada file yang diinginkan.</Step>
              </ol>
              <h4>Menyimpan &amp; Riwayat (Backup versi)</h4>
              <ol className="pd-ol">
                <Step n="1">Klik <b>Simpan</b> (ikon disket) di toolbar. Setiap simpan membuat <b>snapshot versi</b> otomatis.</Step>
                <Step n="2">Menu <b>Riwayat</b> menampilkan versi-versi sebelumnya — Anda dapat <b>memulihkan</b> ke versi lama bila perlu.</Step>
                <Step n="3">File yang dihapus masuk ke <b>Sampah</b> di dalam menu Riwayat dan masih bisa dikembalikan.</Step>
              </ol>
              <h4>Fitur Toolbar Lainnya</h4>
              <ul className="pd-ul">
                <li><b>Format:</b> warna sel/latar, tebal/miring, perataan, border, bentuk/gambar.</li>
                <li><b>Sisip:</b> menambah baris/kolom, menghapus, atau menambah sheet baru.</li>
                <li><b>Data:</b> urutkan (sort), filter kolom, cari teks, dan freeze baris/kolom.</li>
                <li><b>Ekspor:</b> unduh spreadsheet sebagai file Excel (.xlsx).</li>
                <li><b>Import:</b> tambah file Excel langsung dari editor.</li>
              </ul>
              <p className="pd-note">
                Perubahan tersimpan di perangkat/browser Anda (IndexedDB). Gunakan <b>Backup &amp; Restore</b> untuk
                mengamankan data di server.
              </p>
            </div>
          </div>

          {/* 5. FILE TERIMPORT */}
          <div id="pd-file-terimport" className="card pd-section">
            <div className="card-header"><h2>File Terimport</h2></div>
            <div className="card-body">
              <p>Halaman ini berisi daftar semua file Excel yang sudah Anda import.</p>
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>File Terimport</b> di samping kiri.</Step>
                <Step n="2">Setiap baris menampilkan nama file, jumlah sheet, ukuran, dan waktu terakhir diubah.</Step>
                <Step n="3"><b>Buka</b> — membuka file tersebut di editor Spreadsheet.</Step>
                <Step n="4"><b>Ikon pensil</b> — mengubah nama file (Enter untuk simpan, Esc untuk batal).</Step>
                <Step n="5"><b>Hapus</b> — menghapus file dari daftar (ada konfirmasi sebelum dihapus). Jika sudah dihapus
                  di editor, file bisa dikembalikan lewat menu <b>Riwayat &rarr; Sampah</b> di Spreadsheet.</Step>
              </ol>
            </div>
          </div>

          {/* 6. IMPORT EXCEL */}
          <div id="pd-import-excel" className="card pd-section">
            <div className="card-header"><h2>Import Excel</h2></div>
            <div className="card-body">
              {!isSuperAdmin(user) && (
                <p className="pd-note">Menu ini hanya tersedia untuk Super Admin.</p>
              )}
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Import Excel</b> di samping kiri.</Step>
                <Step n="2">Seret (drag &amp; drop) file <b>.xlsx</b> atau <b>.xls</b> ke kotak, atau klik <b>Pilih File</b>.</Step>
                <Step n="3">Tunggu hingga proses membaca selesai. File langsung ditambahkan ke daftar.</Step>
                <Step n="4">Setelah import, Anda diarahkan ke halaman <b>Hasil Import</b> untuk melihat data &amp; membuat chart.</Step>
              </ol>
              <ul className="pd-ul">
                <li>Ukuran file maksimal <b>10 MB</b>.</li>
                <li>Format yang didukung: <b>.xlsx</b> dan <b>.xls</b>.</li>
                <li>Gambar/bentuk, warna, border, dan format angka pada file asli tetap dipertahankan.</li>
              </ul>
            </div>
          </div>

          {/* 7. HASIL IMPORT */}
          <div id="pd-hasil-import" className="card pd-section">
            <div className="card-header"><h2>Hasil Import & Visualisasi</h2></div>
            <div className="card-body">
              <p>Setelah import, halaman ini menampilkan isi file Excel secara 1:1 dengan file aslinya.</p>
              <ol className="pd-ol">
                <Step n="1">Gunakan <b>tab file</b> di atas untuk berpindah antar file yang diimport, dan <b>tab Sheet</b> untuk berpindah sheet.</Step>
                <Step n="2">Tabel menampilkan seluruh baris/kolom beserta format angka asli (contoh: 2008, 9,00%, tanggal).</Step>
                <Step n="3">Bagian <b>Konfigurasi Chart</b>: pilih jenis chart (Bar/Line/Pie/Doughnut/Area), lalu pilih <b>Sumbu X</b> dan centang kolom <b>Sumbu Y</b>.</Step>
                <Step n="4">Grafik tampil otomatis di bawah konfigurasi.</Step>
                <Step n="5">Bagian <b>Perbandingan Data</b> membantu membandingkan antar sheet/kolom.</Step>
              </ol>
            </div>
          </div>

          {/* 8. KATEGORI */}
          <div id="pd-kategori" className="card pd-section">
            <div className="card-header"><h2>Kategori</h2></div>
            <div className="card-body">
              <p>Kategori digunakan untuk mengelompokkan data berdasarkan bidang tertentu (misalnya Hutan, Mineral, Energi, Uang, dan lain-lain).</p>
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Kategori</b>. Terlihat daftar kategori (sheet) dengan baris berisi, sel terisi, dan total nilai.</Step>
                <Step n="2">Di halaman ini Anda hanya melihat rekap. Penambahan/kategorisasi dilakukan di halaman <b>Spreadsheet</b> (tambah sheet dengan nama sesuai kategori).</Step>
              </ol>
            </div>
          </div>

          {/* 9. LAPORAN */}
          <div id="pd-laporan" className="card pd-section">
            <div className="card-header"><h2>Laporan</h2></div>
            <div className="card-body">
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Laporan</b>. Ditampilkan rekap per sheet: jumlah kolom, baris berisi, sel terisi, dan total nilai.</Step>
                <Step n="2">Klik <b>Perbandingan Antar Periode</b> untuk membandingkan data antar waktu.</Step>
                <Step n="3">Gunakan tabel <b>Perbandingan Data</b> di bagian bawah untuk analisis lebih lanjut.</Step>
              </ol>
            </div>
          </div>

          {/* 10. KELOLA AKUN */}
          <div id="pd-admin-user" className="card pd-section">
            <div className="card-header"><h2>Kelola Akun & Role</h2></div>
            <div className="card-body">
              {!isSuperAdmin(user) && <p className="pd-note">Bagian ini hanya untuk Super Admin.</p>}
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>User &amp; Admin</b> (di kelompok "Pengelolaan").</Step>
                <Step n="2"><b>Membuat akun:</b> isi nama, email, password, pilih peran (User/Admin/Super Admin), lalu <b>Simpan</b>.</Step>
                <Step n="3"><b>Mengubah peran:</b> pilih role di dropdown baris akun, atau gunakan tombol cepat
                  <b> &rarr; Admin</b> / <b>&rarr; User</b> untuk memindahkan role.</Step>
                <Step n="4"><b>Mengedit:</b> ubah nama/email/password lalu simpan. <b>Menghapus:</b> klik hapus; akun yang sedang dipakai
                  tidak dapat dihapus/diturunkan sendiri.</Step>
              </ol>
              <p className="pd-note">Sistem memastikan selalu ada minimal satu Super Admin.</p>
            </div>
          </div>

          {/* 11. PENUGASAN TABEL */}
          <div id="pd-admin-tugas" className="card pd-section">
            <div className="card-header"><h2>Penugasan Tabel ke Admin</h2></div>
            <div className="card-body">
              {!isSuperAdmin(user) && <p className="pd-note">Bagian ini hanya untuk Super Admin.</p>}
              <p>Admin baru yang dibuat <b>belum bisa mengisi data</b> sampai ada tabel yang ditugaskan kepadanya.</p>
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Penugasan Tabel</b>.</Step>
                <Step n="2">Pilih <b>Admin</b>, <b>Jenis tabel</b> (Spreadsheet/Kategori), dan <b>tabel</b> yang dituju.</Step>
                <Step n="3">Aktifkan izin <b>Entry</b> (mengisi baris baru) dan/atau <b>Edit</b> (mengubah data), lalu simpan.</Step>
                <Step n="4">Daftar penugasan muncul di bawah; Anda dapat mengubah izin atau menghapus penugasan kapan saja.</Step>
              </ol>
              <p className="pd-note">Jika ingin Admin dapat mengakses semua, tugaskan tabel yang diperlukan satu per satu.</p>
            </div>
          </div>

          {/* 12. MAINTENANCE */}
          <div id="pd-admin-maintenance" className="card pd-section">
            <div className="card-header"><h2>Maintenance Mode</h2></div>
            <div className="card-body">
              {!isSuperAdmin(user) && <p className="pd-note">Bagian ini hanya untuk Super Admin.</p>}
              <p>Fitur ini memblokir sementara akses seluruh <b>User</b> &amp; <b>Admin</b>. <b>Super Admin tetap bisa masuk</b>.</p>
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Maintenance</b>.</Step>
                <Step n="2">Aktifkan toggle <b>Aktifkan Maintenance sekarang</b>.</Step>
                <Step n="3">Isi <b>Judul</b> dan <b>Pesan</b> yang tampil untuk pengguna lain.</Step>
                <Step n="4">(Opsional) tentukan <b>Mulai</b> dan <b>Selesai</b>. Di luar jadwal, sistem kembali normal otomatis.</Step>
                <Step n="5">Klik <b>Simpan &amp; Nyalakan</b>. Untuk menonaktifkan, matikan toggle lalu simpan.</Step>
              </ol>
            </div>
          </div>

          {/* 13. BACKUP & RESTORE */}
          <div id="pd-admin-backup" className="card pd-section">
            <div className="card-header"><h2>Backup & Restore</h2></div>
            <div className="card-body">
              {!isSuperAdmin(user) && <p className="pd-note">Bagian ini hanya untuk Super Admin.</p>}
              <p>Amankan data sebelum melakukan perubahan besar. Semua tabel (kecuali sesi login &amp; arsip backup) dicadangkan ke satu berkas JSON.</p>
              <h4>Membuat Backup</h4>
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Backup &amp; Restore</b>.</Step>
                <Step n="2">Klik <b>+ Buat Backup Baru</b>. Nama otomatis memakai tanggal waktu kini.</Step>
                <Step n="3">Backup muncul di tabel beserta ukuran dan pembuatnya.</Step>
              </ol>
              <h4>Mengunduh / Restore / Menghapus</h4>
              <ol className="pd-ol">
                <Step n="1"><b>Unduh</b> — simpan berkas backup ke komputer (portabel).</Step>
                <Step n="2"><b>Restore</b> — pulihkan isi backup ke database. Proses bersifat <b>menggabung (upsert)</b>: data yang tidak ada di backup
                  <b>tidak dihapus</b>.</Step>
                <Step n="3"><b>Hapus</b> — hapus arsip backup. Berkas yang sudah diunduh tidak terpengaruh.</Step>
              </ol>
            </div>
          </div>

          {/* 14. PENGATURAN */}
          <div id="pd-admin-pengaturan" className="card pd-section">
            <div className="card-header"><h2>Pengaturan Umum</h2></div>
            <div className="card-body">
              {!isSuperAdmin(user) && <p className="pd-note">Bagian ini hanya untuk Super Admin.</p>}
              <ol className="pd-ol">
                <Step n="1">Buka menu <b>Pengaturan</b>.</Step>
                <Step n="2">Atur toggle <b>Izinkan pendaftaran terbuka (User baru)</b>.</Step>
                <Step n="3">Bila dimatikan, halaman daftar tidak dipakai — semua akun dibuat oleh Super Admin lewat
                  <b> User &amp; Admin</b>.</Step>
                <Step n="4">Klik <b>Simpan Pengaturan</b>.</Step>
              </ol>
            </div>
          </div>

          {/* 15. TIPS */}
          <div id="pd-tips" className="card pd-section">
            <div className="card-header"><h2>Tips & Catatan Penting</h2></div>
            <div className="card-body">
              <ul className="pd-ul">
                <li><b>Data spreadsheet tersimpan di perangkat</b> (IndexedDB). Bersihkan data browser (cache/storage) hanya jika Anda sudah punya backup.</li>
                <li>Selalu buat <b>Backup</b> di server sebelum melakukan perubahan besar atau sebelum membersihkan browser.</li>
                <li>Admin diwajibkan memiliki <b>penugasan tabel</b> sebelum bisa entry/edit — jika tombol edit tidak aktif, hubungi Super Admin.</li>
                <li>Gunakan <b>Riwayat</b> di Spreadsheet untuk mengembalikan versi lama atau file yang terhapus (Sampah).</li>
                <li>Saat <b>Maintenance</b> aktif, hanya Super Admin yang bisa mengakses sistem; pengguna lain melihat halaman pemberitahuan.</li>
                <li>Import Excel di atas 10 MB atau format selain .xlsx/.xls akan ditolak.</li>
                <li>Dashboard, Kategori, dan Laporan memperbarui angka secara otomatis — tidak perlu mengisi ulang.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}