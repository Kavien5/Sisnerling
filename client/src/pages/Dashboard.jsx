import React from "react";
import Modal from "../components/Modal.jsx";
import SpreadsheetCharts from "../components/SpreadsheetCharts.jsx";
import PerbandinganData from "../components/PerbandinganData.jsx";
import { getSheets } from "../spreadsheetWorkbook.js";
import { sheetsToTables } from "../perbandinganUtils.js";
import { api } from "../api.js";

const DEFAULT_GREETING = {
  title: "Selamat Datang di SISNERLING",
  description:
    "Sistem ini digunakan untuk mengolah data input\u2013output secara terpusat. Anda dapat memasukkan atau mengimpor data spreadsheet, mengelolanya berdasarkan kategori (Hutan, Mineral, Energi, Uang, dan lainnya), lalu memantau statistik dan progres seluruh data melalui Dashboard ini.",
};

export default function Dashboard() {
  const [showInfo, setShowInfo] = React.useState(false);
  const [greeting, setGreeting] = React.useState(DEFAULT_GREETING);
  const [tables, setTables] = React.useState(() => sheetsToTables(getSheets()));

  React.useEffect(() => {
    api.getDashboardGreeting().then(setGreeting).catch(() => {});
  }, []);

  React.useEffect(() => {
    const refresh = () => setTables(sheetsToTables(getSheets()));
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <>
      <div className="page-title">
        <div>
          <h2>Dashboard</h2>
          <p>Statistik dan progres seluruh data dari halaman Spreadsheet</p>
        </div>
      </div>

      <button type="button" className="info-card" onClick={() => setShowInfo(true)}>
        <span className="info-card-icon">&#128161;</span>
        <span className="info-card-body">
          <span className="info-card-title">{greeting.title}</span>
          <span className="info-card-desc">{greeting.description}</span>
        </span>
        <span className="info-card-action">
          <span>Selengkapnya</span>
          <span className="info-card-arrow">&#8594;</span>
        </span>
      </button>

      <SpreadsheetCharts />

      <div className="card mt">
        <PerbandinganData tables={tables} title="Perbandingan Data" />
      </div>

      {showInfo && (
        <Modal
          title="Penjelasan Sistem"
          onClose={() => setShowInfo(false)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setShowInfo(false)}>
              Tutup
            </button>
          }
        >
          <div className="info-modal">
            <h4>Tentang Sistem</h4>
            <p>
              <b>Sisnerling</b> adalah sistem pengolahan data input–output yang memungkinkan Anda mengelola
              sekumpulan data berbentuk spreadsheet secara terpusat dan terstruktur. Seluruh data disimpan dan
              diproses dalam satu aplikasi sehingga mudah untuk dimasukkan, dipantau, dianalisis, dan dilaporkan.
            </p>

            <h4>Fungsi Utama</h4>
            <ul>
              <li><b>Spreadsheet:</b> halaman untuk membuat, mengisi, dan mengedit data dalam bentuk tabel spreadsheet.</li>
              <li><b>Kategori:</b> mengelompokkan data ke dalam kategori seperti Hutan, Mineral, Energi, dan Uang, lengkap dengan sub-kategorinya.</li>
              <li><b>Laporan &amp; Neraca:</b> menyusun ringkasan dan neraca dari data yang sudah dimasukkan.</li>
              <li><b>Import Excel:</b> mengimpor data dari berkas Excel (xlsx) agar tidak perlu mengetik ulang.</li>
              <li><b>Dashboard:</b> halaman saat ini yang menampilkan statistik dan grafik progres seluruh data secara ringkas.</li>
            </ul>

            <h4>Cara Penggunaan</h4>
            <ol>
              <li>Mulai dari menu <b>Spreadsheet</b> untuk membuat atau mengimpor data Anda.</li>
              <li>Gunakan menu <b>Kategori</b> apabila ingin mengelompokkan data berdasarkan jenis atau bidang tertentu.</li>
              <li>Kembali ke <b>Dashboard</b> untuk melihat ringkasan statistik, total nilai, dan grafik setiap sheet.</li>
              <li>Gunakan menu <b>Laporan</b>, <b>Neraca</b>, atau <b>Import Excel</b> sesuai kebutuhan pelaporan dan impor data.</li>
            </ol>

            <h4>Informasi Penting</h4>
            <ul>
              <li>Statistik pada Dashboard diperbarui otomatis dari data Spreadsheet yang tersimpan.</li>
              <li>Jika belum ada data, masuklah ke halaman <b>Spreadsheet</b> lalu isi atau impor data terlebih dahulu.</li>
              <li>Angka pada Dashboard ditampilkan dalam format ribuan agar lebih mudah dibaca.</li>
            </ul>
          </div>
        </Modal>
      )}

    </>
  );
}